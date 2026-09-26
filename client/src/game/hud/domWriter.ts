/** For HUD-owned elements only. Cache raw values (CSSOM may normalize colors/gradients). */
export function createDomWriter() {
  const values = new WeakMap<Element, Map<string, string | boolean>>();
  function changed(el: Element, key: string, value: string | boolean): boolean {
    let cache = values.get(el);
    if (!cache) { cache = new Map(); values.set(el, cache); }
    if (cache.get(key) === value) return false;
    cache.set(key, value);
    return true;
  }
  return {
    text(el: Element, value: string) {
      if (changed(el, "text", value)) el.textContent = value;
    },
    attribute(el: Element, name: string, value: string) {
      if (changed(el, `attr:${name}`, value)) el.setAttribute(name, value);
    },
    style(el: HTMLElement | SVGElement, name: string, value: string) {
      if (changed(el, `style:${name}`, value)) el.style.setProperty(name, value);
    },
    toggle(el: Element, name: string, value: boolean) {
      if (changed(el, `class:${name}`, value)) el.classList.toggle(name, value);
    },
  };
}
