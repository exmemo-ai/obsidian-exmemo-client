import { Notice } from 'obsidian';
import { t } from "src/lang/helpers"

export class ExMemoNotice {
	active: Record<string, Notice>;

	constructor() {
		this.active = {};
	}

	showInfo(id: string, message: string, opts: any = {}) {
		if (typeof opts.timeout === 'undefined')
			opts.timeout = 0;
		else if (opts.timeout > 0) { // set message not support timeout
			this.hide(id);
		}
		let frag: DocumentFragment | string = message;
		if (opts.button && opts.button.text && opts.button.callback) {
			frag = document.createDocumentFragment();
			frag.createEl("p", { text: t("sync"), cls: "notice-title" });
			let content = frag.createEl("p", {});
			content.innerText = message;
			let actions = frag.createEl("div", { cls: "notice-actions" });
			let btn = document.createElement("button");
			btn.textContent = opts.button.text;
			btn.addEventListener("click", (e) => {
				if (opts.button.stay_open) {
					e.preventDefault();
					e.stopPropagation();
				}
				opts.button.callback();
			});
			actions.appendChild(btn);
		}
		if (this.active[id]) {
			this.active[id].setMessage(frag);
		} else {
			if (opts.timeout == 0) {
				this.active[id] = new Notice(frag, opts.timeout);
			} else {
				new Notice(frag, opts.timeout);
			}
		}
	}

	async hide(id: string) {
		await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 second
		if (this.active[id]) {
			this.active[id].hide();
			delete this.active[id];
		}
	}
}

