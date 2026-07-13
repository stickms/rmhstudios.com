/**
 * Promise-based file picking for canvas UIs — creates a transient hidden
 * `<input type=file>` (a sanctioned non-visible helper), clicks it, resolves
 * with the chosen files.
 */

export interface PickFilesOptions {
  accept?: string;
  multiple?: boolean;
}

export function pickFiles({ accept, multiple }: PickFilesOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    if (multiple) input.multiple = true;
    input.style.display = "none";
    input.onchange = () => {
      resolve(input.files ? [...input.files] : []);
      input.remove();
    };
    // Cancel (no change event on all browsers) — clean up on next focus.
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (document.body.contains(input)) {
            resolve(input.files ? [...input.files] : []);
            input.remove();
          }
        }, 300);
      },
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}
