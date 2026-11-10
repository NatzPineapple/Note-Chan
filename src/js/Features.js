/* ──────────────────────────────  Features.js  ───────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.Features = factory();
    }
})(function () {
    return Object.freeze({
        pet: false
    });
});
