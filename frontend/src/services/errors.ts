export class NotImplementedError extends Error {
    constructor(feature: string) {
        super(`${feature} is not implemented — contracts not yet wired up.`);
        this.name = "NotImplementedError";
    }
}
