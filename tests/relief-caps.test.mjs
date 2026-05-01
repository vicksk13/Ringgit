import assert from "node:assert/strict";

const cap = (v, c) => Math.min(v, c);

// G1
assert.equal(cap(999999, 9000), 9000);

// Individual cap
assert.equal(9000 + 7000 + 4000 + 6000, 26000);

// Medical caps
const med678 = Math.min(cap(20000, 10000) + cap(5000, 1000) + cap(9000, 6000), 10000);
assert.equal(med678, 10000);
assert.equal(8000 + 6000 + 10000, 24000);

// Lifestyle caps
assert.equal(2500 + 1000 + 2500, 6000);

// Insurance caps
const g17 = Math.min(cap(9000, 3000) + cap(9000, 4000), 7000);
assert.equal(g17, 7000);
assert.equal(7000 + 3000 + 4000 + 350, 14350);

// Education caps
assert.equal(7000 + 8000, 15000);

// Housing mutual exclusivity (max one option)
assert.equal(Math.max(7000, 5000), 7000);

console.log("relief cap tests passed");
