"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinkError = void 0;
class ClinkError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'ClinkError';
    }
}
exports.ClinkError = ClinkError;
//# sourceMappingURL=errors.js.map