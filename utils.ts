import { App, Modal } from 'obsidian';
import { t } from "./lang/helpers"

export class ConfirmModal extends Modal {
    result: boolean | null = null;
    resolvePromise: (value: boolean) => void;
    info: string;

    constructor(app: App, info: string, resolve: (value: boolean) => void) {
        super(app);
        this.resolvePromise = resolve;
        this.info = info;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: t('are_you_sure') });
        contentEl.createEl("p", { text: this.info, cls: "info-paragraph" });

        const buttonContainer = contentEl.createDiv({ cls: "confirm-modal-buttons" });
        const yesButton = buttonContainer.createEl("button", { text: t('yes'), cls: "yes-button" });
        yesButton.onclick = () => {
            this.result = true;
            this.resolvePromise(true);
            this.close();
        };

        const noButton = buttonContainer.createEl("button", { text: t('no'), cls: "no-button" });
        noButton.onclick = () => {
            this.result = false;
            this.resolvePromise(false);
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
