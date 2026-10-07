// ---------------------------------------------------------------------------
// plugins/browser/orchestrator/browser-service.ts
// Multi-tab Playwright browser service (plugin-owned).
// ---------------------------------------------------------------------------

import { mkdirSync } from 'fs';
import { join } from 'path';

import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';

import { log } from '@src/logger';

export type BrowserRuntimeConfig = {
  profileDir: string;
  headless: boolean;
};

export const DEFAULT_BROWSER_CONFIG: BrowserRuntimeConfig = {
  profileDir: join(import.meta.dir, '..', 'profile'),
  headless: false,
};

export type BrowserInteractableElement = {
  id: string;
  tag: string;
  role: string | null;
  label: string | null;
  text: string | null;
  inputType: string | null;
  disabled: boolean;
  editable: boolean;
  href: string | null;
  options: { value: string; label: string; disabled: boolean }[];
  value: string | null;
  checked: boolean | null;
};

export type BrowserSnapshot = {
  documentId: string;
  url: string;
  title: string;
  visibleTextSummary: string;
  interactableElements: BrowserInteractableElement[];
  canScrollUp: boolean;
  canScrollDown: boolean;
};

export type BrowserAction =
  | { type: 'start' }
  | { type: 'navigate'; url: string }
  | { type: 'snapshot' }
  | { type: 'click'; elementId: string }
  | { type: 'type'; elementId: string; text: string; clear?: boolean }
  | { type: 'select'; elementId: string; value: string }
  | { type: 'press_element'; elementId: string; key: 'Enter' }
  | { type: 'press'; key: string }
  | { type: 'scroll'; deltaX?: number; deltaY?: number }
  | { type: 'wait'; elementId?: string; text?: string; timeoutMs?: number };

export type BrowserActionResult = {
  summary: string;
  snapshot: BrowserSnapshot;
};

const STABLE_ID_ATTR = 'data-dm-bot-browser-id';
const MAX_SNAPSHOT_ELEMENTS = 120;
const MAX_VISIBLE_TEXT_CHARS = 6000;

const BRAVE_EXECUTABLE_PATH =
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const BROWSER_LAUNCH_ARGS = ['--disable-blink-features=AutomationControlled'];

class BrowserService {
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private activeProfileDir: string | null = null;
  private contextPromise: Promise<BrowserContext> | null = null;

  isTabOpen(tabId: string): boolean {
    const page = this.pages.get(tabId);

    return this.context !== null && page !== undefined && !page.isClosed();
  }

  private async getContext(
    config: BrowserRuntimeConfig,
  ): Promise<BrowserContext> {
    if (this.contextPromise) {
      return this.contextPromise;
    }

    const pending = this.ensureContext(config);
    this.contextPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.contextPromise === pending) {
        this.contextPromise = null;
      }
    }
  }

  private async ensureContext(
    config: BrowserRuntimeConfig,
  ): Promise<BrowserContext> {
    if (
      this.context === null ||
      this.activeProfileDir !== config.profileDir ||
      this.context.browser()?.isConnected() === false
    ) {
      await this.dispose();
      mkdirSync(config.profileDir, { recursive: true });

      log.info(
        `browser: launching persistent Chromium (${config.headless ? 'headless' : 'headed'}) at ${config.profileDir}`,
      );

      this.context = await chromium.launchPersistentContext(config.profileDir, {
        executablePath: BRAVE_EXECUTABLE_PATH,
        headless: config.headless,
        args: BROWSER_LAUNCH_ARGS,
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: null,
      });

      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });
      });

      this.activeProfileDir = config.profileDir;

      const context = this.context;

      context.on('close', () => {
        if (this.context === context) {
          this.context = null;
          this.activeProfileDir = null;
          this.pages.clear();
        }
      });

      this.context.on('page', (page) => {
        log.info(`browser: new page opened: ${page.url()}`);
      });
    }

    return this.context;
  }

  async openTab(config: BrowserRuntimeConfig, tabId: string): Promise<Page> {
    const ctx = await this.getContext(config);
    const existing = this.pages.get(tabId);

    if (existing && !existing.isClosed()) {
      return existing;
    }

    const page = await ctx.newPage();
    this.pages.set(tabId, page);

    page.on('close', () => {
      if (this.pages.get(tabId) === page) {
        this.pages.delete(tabId);
      }
    });

    this.followTaskPopups(tabId, page);

    log.info(`browser: opened tab ${tabId}`);

    return page;
  }

  async getTab(config: BrowserRuntimeConfig, tabId: string): Promise<Page> {
    await this.getContext(config);
    const page = this.pages.get(tabId);

    if (!page || page.isClosed()) {
      return this.openTab(config, tabId);
    }

    return page;
  }

  /**
   * Recover a tab for a task on resume, in priority order:
   * 1. Existing in-memory tab that is still open.
   * 2. An unassigned exact-URL match, or a unique unassigned hostname match.
   * 3. A fresh tab, optionally navigated to lastUrl.
   */
  async findOrRecoverTab(
    config: BrowserRuntimeConfig,
    tabId: string,
    lastUrl: string | null,
  ): Promise<Page> {
    const ctx = await this.getContext(config);
    const existing = this.pages.get(tabId);

    if (existing && !existing.isClosed()) {
      log.info(`browser: reusing in-memory tab ${tabId}`);

      return existing;
    }

    if (lastUrl) {
      let targetHostname: string | null = null;

      try {
        targetHostname = new URL(lastUrl).hostname;
      } catch {
        // malformed URL — skip hostname matching
      }

      if (targetHostname) {
        const candidates = ctx.pages().filter((p) => {
          if (p.isClosed() || Array.from(this.pages.values()).includes(p)) {
            return false;
          }

          try {
            return new URL(p.url()).hostname === targetHostname;
          } catch {
            return false;
          }
        });

        const exact = candidates.filter((p) => p.url() === lastUrl);

        const match =
          exact.length === 1
            ? exact[0]
            : candidates.length === 1
              ? candidates[0]
              : null;

        if (match) {
          this.pages.set(tabId, match);
          this.followTaskPopups(tabId, match);

          log.info(
            `browser: recovered tab ${tabId} from existing page at ${match.url()}`,
          );

          return match;
        }
      }
    }

    const page = await this.openTab(config, tabId);

    if (lastUrl) {
      try {
        await page.goto(lastUrl, { waitUntil: 'domcontentloaded' });
      } catch (error) {
        // Do not cache a failed recovery as a ready tab for the next attempt.
        await this.closeTab(tabId).catch(() => undefined);
        throw error;
      }

      await settlePage(page);

      log.info(
        `browser: opened fresh tab ${tabId} and navigated to ${lastUrl}`,
      );
    }

    return page;
  }

  async closeTab(tabId: string): Promise<void> {
    const page = this.pages.get(tabId);

    if (page && !page.isClosed()) {
      await page.close();
    }

    this.pages.delete(tabId);
    log.info(`browser: closed tab ${tabId}`);
  }

  private followTaskPopups(tabId: string, page: Page): void {
    page.on('popup', (popup) => {
      if (this.pages.get(tabId) !== page) {
        return;
      }

      this.pages.set(tabId, popup);
      this.followTaskPopups(tabId, popup);

      popup.on('close', () => {
        if (this.pages.get(tabId) === popup) {
          if (!page.isClosed()) {
            this.pages.set(tabId, page);
          } else {
            this.pages.delete(tabId);
          }
        }
      });
    });
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }

    this.context = null;
    this.pages.clear();
    this.activeProfileDir = null;
  }

  async snapshot(
    config: BrowserRuntimeConfig,
    tabId: string,
  ): Promise<BrowserSnapshot> {
    const page = await this.getTab(config, tabId);
    await settlePage(page);

    return captureSnapshot(page);
  }

  async runAction(
    config: BrowserRuntimeConfig,
    tabId: string,
    action: BrowserAction,
  ): Promise<BrowserActionResult> {
    if (action.type === 'start') {
      const page = await this.openTab(config, tabId);
      await settlePage(page);

      return {
        summary: `Tab ${tabId} ready with persistent profile at ${config.profileDir}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    const page = await this.getTab(config, tabId);

    if (action.type === 'navigate') {
      await page.goto(action.url, { waitUntil: 'domcontentloaded' });
      await settlePage(page);

      return {
        summary: `Navigated tab ${tabId} to ${action.url}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'snapshot') {
      return {
        summary: `Captured snapshot for tab ${tabId}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'click') {
      await locatorForElementId(page, action.elementId).click();
      await settlePage(page);
      const currentPage = await this.getTab(config, tabId);

      if (currentPage !== page) {
        await settlePage(currentPage);
      }

      return {
        summary: `Clicked element ${action.elementId} in tab ${tabId}.`,
        snapshot: await captureSnapshot(currentPage),
      };
    }

    if (action.type === 'type') {
      const locator = locatorForElementId(page, action.elementId);

      const permitted = await locator.evaluate((el) => {
        const input = el instanceof HTMLInputElement ? el : null;

        return (
          !input ||
          (input.type !== 'password' &&
            !/one-time-code|current-password|new-password/.test(
              input.autocomplete,
            ))
        );
      });

      if (!permitted) {
        throw new Error(
          'Complete credentials or verification manually in the browser.',
        );
      }

      if (action.clear !== false) {
        await locator.fill(action.text);
      } else {
        await locator.pressSequentially(action.text);
      }

      await settlePage(page);

      return {
        summary: `Typed into element ${action.elementId} in tab ${tabId}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'select') {
      await locatorForElementId(page, action.elementId).selectOption(
        action.value,
      );

      await settlePage(page);

      return {
        summary: `Selected an observed option in element ${action.elementId}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'press_element') {
      await locatorForElementId(page, action.elementId).press(action.key);
      await settlePage(page);

      return {
        summary: `Pressed ${action.key} in element ${action.elementId}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'press') {
      await page.keyboard.press(action.key);
      await settlePage(page);

      return {
        summary: `Pressed key ${action.key} in tab ${tabId}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'scroll') {
      const deltaX = Number.isFinite(action.deltaX) ? (action.deltaX ?? 0) : 0;

      const deltaY = Number.isFinite(action.deltaY)
        ? (action.deltaY ?? 600)
        : 600;

      await page.mouse.wheel(deltaX, deltaY);
      await settlePage(page);

      return {
        summary: `Scrolled tab ${tabId} by (${deltaX}, ${deltaY}).`,
        snapshot: await captureSnapshot(page),
      };
    }

    if (action.type === 'wait') {
      const timeoutMs =
        Number.isFinite(action.timeoutMs) && (action.timeoutMs ?? 0) > 0
          ? (action.timeoutMs as number)
          : 10_000;

      if (action.elementId) {
        await locatorForElementId(page, action.elementId).waitFor({
          state: 'visible',
          timeout: timeoutMs,
        });
      } else if (action.text) {
        await page.getByText(action.text, { exact: false }).first().waitFor({
          state: 'visible',
          timeout: timeoutMs,
        });
      } else {
        await page.waitForTimeout(timeoutMs);
      }

      await settlePage(page);

      return {
        summary:
          action.elementId != null
            ? `Waited for element ${action.elementId} in tab ${tabId}.`
            : action.text != null
              ? `Waited for text ${JSON.stringify(action.text)} in tab ${tabId}.`
              : `Waited ${timeoutMs}ms in tab ${tabId}.`,
        snapshot: await captureSnapshot(page),
      };
    }

    throw new Error(`Unsupported browser action: ${JSON.stringify(action)}`);
  }

  async validateActionTarget(props: {
    tabId: string;
    documentId: string;
    action: BrowserAction;
  }): Promise<void> {
    const page = this.pages.get(props.tabId);

    if (!page || page.isClosed()) {
      throw new Error('The task browser tab was closed.');
    }

    if (!('elementId' in props.action)) {
      return;
    }

    const elementId = props.action.elementId;

    if (!elementId) {
      return;
    }

    const valid = await locatorForElementId(page, elementId).evaluate(
      (el, expected) => {
        const state = window as Window & {
          __dmBotBrowserDocumentId?: string;
          __dmBotBrowserElements?: WeakMap<Element, string>;
        };

        return (
          state.__dmBotBrowserDocumentId === expected.documentId &&
          state.__dmBotBrowserElements?.get(el) === expected.elementId &&
          el.isConnected
        );
      },
      { documentId: props.documentId, elementId },
    );

    if (!valid) {
      throw new Error(
        'The selected control belongs to an outdated document. Observe the current page before acting.',
      );
    }
  }
}

function locatorForElementId(page: Page, elementId: string): Locator {
  return page.locator(`[${STABLE_ID_ATTR}="${cssEscape(elementId)}"]`).first();
}

function cssEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.waitForTimeout(250);
}

async function captureSnapshot(page: Page): Promise<BrowserSnapshot> {
  return page.evaluate(
    ({ attr, maxElements, maxVisibleTextChars }) => {
      const scopedWindow = window as Window & {
        __dmBotBrowserNextId?: number;
        __dmBotBrowserDocumentId?: string;
        __dmBotBrowserElements?: WeakMap<Element, string>;
      };

      scopedWindow.__dmBotBrowserDocumentId ??=
        crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

      scopedWindow.__dmBotBrowserElements ??= new WeakMap();

      if (typeof scopedWindow.__dmBotBrowserNextId !== 'number') {
        scopedWindow.__dmBotBrowserNextId = 1;
      }

      function normalizeText(value: string | null | undefined): string | null {
        const normalized = (value ?? '').replace(/\s+/g, ' ').trim();

        return normalized.length > 0 ? normalized : null;
      }

      function isVisible(el: Element): boolean {
        if (el.closest('[hidden], [aria-hidden="true"], [inert]')) {
          return false;
        }

        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        const rect = htmlEl.getBoundingClientRect();

        const hidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          rect.width === 0 ||
          rect.height === 0;

        if (
          hidden ||
          rect.bottom <= 0 ||
          rect.top >= innerHeight ||
          rect.right <= 0 ||
          rect.left >= innerWidth
        ) {
          return false;
        }

        const x = Math.max(
          0,
          Math.min(innerWidth - 1, rect.left + rect.width / 2),
        );

        const y = Math.max(
          0,
          Math.min(innerHeight - 1, rect.top + rect.height / 2),
        );

        const hit = document.elementFromPoint(x, y);

        return hit !== null && (hit === el || el.contains(hit));
      }

      function getStableId(el: Element): string {
        const existing = scopedWindow.__dmBotBrowserElements!.get(el);

        if (existing) {
          el.setAttribute(attr, existing);

          return existing;
        }

        const nextId = `e${scopedWindow.__dmBotBrowserNextId ?? 1}`;

        scopedWindow.__dmBotBrowserNextId =
          (scopedWindow.__dmBotBrowserNextId ?? 1) + 1;

        el.setAttribute(attr, nextId);
        scopedWindow.__dmBotBrowserElements!.set(el, nextId);

        return nextId;
      }

      function getLabel(el: Element): string | null {
        const htmlEl = el as HTMLElement;
        const ariaLabel = normalizeText(htmlEl.getAttribute('aria-label'));

        if (ariaLabel) {
          return ariaLabel;
        }

        const labelledBy = htmlEl
          .getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ');

        if (normalizeText(labelledBy)) {
          return normalizeText(labelledBy);
        }

        if (htmlEl instanceof HTMLInputElement) {
          const fromLabels = normalizeText(
            Array.from(htmlEl.labels ?? [])
              .map((label) => label.innerText || label.textContent || '')
              .join(' '),
          );

          if (fromLabels) {
            return fromLabels;
          }
        }

        return (
          normalizeText(htmlEl.getAttribute('placeholder')) ??
          normalizeText(htmlEl.innerText) ??
          normalizeText(htmlEl.textContent)
        );
      }

      const selectors = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        'summary',
        '[role="button"]',
        '[role="link"]',
        '[role="option"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="switch"]',
        '[role="combobox"]',
        '[contenteditable="true"]',
        '[contenteditable=""]',
      ].join(',');

      const interactableElements = Array.from(
        document.querySelectorAll(selectors),
      )
        .filter((el) => isVisible(el))
        .slice(0, maxElements)
        .map((el) => {
          const htmlEl = el as HTMLElement;
          const inputEl = el instanceof HTMLInputElement ? el : null;

          const credential =
            inputEl !== null &&
            (inputEl.type === 'password' ||
              /one-time-code|current-password|new-password/.test(
                inputEl.autocomplete,
              ) ||
              /password|verification code|captcha|one.time|\botp\b/i.test(
                getLabel(el) ?? '',
              ));

          const editable =
            !credential &&
            ((inputEl !== null &&
              [
                'text',
                'search',
                'email',
                'url',
                'tel',
                'number',
                'date',
                'time',
                'datetime-local',
              ].includes(inputEl.type)) ||
              el instanceof HTMLTextAreaElement ||
              htmlEl.isContentEditable);

          return {
            id: getStableId(el),
            tag: el.tagName.toLowerCase(),
            role: normalizeText(el.getAttribute('role')),
            label: getLabel(el),
            text:
              normalizeText(htmlEl.innerText) ?? normalizeText(el.textContent),
            inputType: inputEl ? normalizeText(inputEl.type) : null,
            disabled:
              htmlEl.matches(':disabled') ||
              htmlEl.getAttribute('aria-disabled') === 'true' ||
              (inputEl?.readOnly ?? false) ||
              (el instanceof HTMLTextAreaElement && el.readOnly),
            editable,
            href: el instanceof HTMLAnchorElement ? el.href : null,
            options:
              el instanceof HTMLSelectElement
                ? Array.from(el.options).map((option) => ({
                    value: option.value,
                    label: option.label,
                    disabled:
                      option.disabled ||
                      (option.parentElement instanceof HTMLOptGroupElement &&
                        option.parentElement.disabled),
                  }))
                : [],
            value: credential
              ? null
              : editable &&
                  (el instanceof HTMLInputElement ||
                    el instanceof HTMLTextAreaElement)
                ? el.value.slice(0, 20_000)
                : el instanceof HTMLSelectElement
                  ? el.value
                  : htmlEl.isContentEditable
                    ? htmlEl.innerText.slice(0, 20_000)
                    : null,
            checked:
              inputEl && ['checkbox', 'radio'].includes(inputEl.type)
                ? inputEl.checked
                : htmlEl.getAttribute('aria-checked') === 'true'
                  ? true
                  : htmlEl.getAttribute('aria-checked') === 'false'
                    ? false
                    : null,
          };
        });

      const textParts: string[] = [];
      let textLength = 0;

      if (document.body) {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );

        for (
          let visited = 0;
          visited < 2000 && textLength < maxVisibleTextChars;
          visited += 1
        ) {
          const node = walker.nextNode();

          if (!node) {
            break;
          }

          const parent = node.parentElement;

          if (
            !parent ||
            parent.closest(
              'script, style, noscript, [hidden], [aria-hidden="true"]',
            )
          ) {
            continue;
          }

          const text = normalizeText(node.textContent);

          if (!text) {
            continue;
          }

          const rect = parent.getBoundingClientRect();
          const style = getComputedStyle(parent);

          if (
            rect.bottom <= 0 ||
            rect.top >= innerHeight ||
            rect.width === 0 ||
            rect.height === 0 ||
            style.visibility === 'hidden' ||
            style.display === 'none'
          ) {
            continue;
          }

          textParts.push(text);
          textLength += text.length + 1;
        }
      }

      const visibleTextSummary = textParts
        .join(' ')
        .slice(0, maxVisibleTextChars);

      return {
        documentId: scopedWindow.__dmBotBrowserDocumentId,
        url: window.location.href,
        title: document.title,
        visibleTextSummary: visibleTextSummary ?? '',
        interactableElements,
        canScrollUp: window.scrollY > 0,
        canScrollDown:
          window.scrollY + innerHeight <
          (document.scrollingElement?.scrollHeight ?? 0) - 2,
      };
    },
    {
      attr: STABLE_ID_ATTR,
      maxElements: MAX_SNAPSHOT_ELEMENTS,
      maxVisibleTextChars: MAX_VISIBLE_TEXT_CHARS,
    },
  );
}

const singleton = new BrowserService();

export function getBrowserService(): BrowserService {
  return singleton;
}
