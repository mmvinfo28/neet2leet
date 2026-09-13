// Unit tests for src/sigfix.js against real NeetCode / LeetCode starter snippets.
//   node test/sigfix.js
import assert from 'node:assert';
import { extractIdents, computeFix, applyFix, guessFix, reverseFix, guessReverseFix } from '../src/sigfix.js';

const L = (...lines) => lines.join('\n') + '\n';

// --- Contains Duplicate (NeetCode: hasDuplicate, LeetCode: containsDuplicate)
const ncPy = L('class Solution:', '    def hasDuplicate(self, nums: List[int]) -> bool:', '        ');
const lcPy = L('class Solution:', '    def containsDuplicate(self, nums: List[int]) -> bool:', '        ');
assert.deepStrictEqual(computeFix(ncPy, lcPy, 'python3'), { r: [['hasDuplicate', 'containsDuplicate']] });

const ncCs = L('public class Solution {', '    public bool hasDuplicate(int[] nums) {', '        ', '    }', '}');
const lcCs = L('public class Solution {', '    public bool ContainsDuplicate(int[] nums) {', '        ', '    }', '}');
assert.deepStrictEqual(computeFix(ncCs, lcCs, 'csharp'), { r: [['hasDuplicate', 'ContainsDuplicate']] });

const ncGo = L('func hasDuplicate(nums []int) bool {', '    ', '}');
const lcGo = L('func containsDuplicate(nums []int) bool {', '    ', '}');
assert.deepStrictEqual(computeFix(ncGo, lcGo, 'golang'), { r: [['hasDuplicate', 'containsDuplicate']] });

const ncRs = L('impl Solution {', '    pub fn has_duplicate(nums: Vec<i32>) -> bool {', '        ', '    }', '}');
const lcRs = L('impl Solution {', '    pub fn contains_duplicate(nums: Vec<i32>) -> bool {', '        ', '    }', '}');
assert.deepStrictEqual(computeFix(ncRs, lcRs, 'rust'), { r: [['has_duplicate', 'contains_duplicate']] });

// --- identical shapes -> empty fix
const ncJava = L('class Solution {', '    public int[] twoSum(int[] nums, int target) {', '        ', '    }', '}');
assert.deepStrictEqual(computeFix(ncJava, ncJava, 'java'), {});

// --- JavaScript: class Solution on NeetCode vs top-level function on LeetCode
const ncJs = L('class Solution {', '    /**', '     * @param {number[]} nums', '     * @return {boolean}', '     */', '    hasDuplicate(nums) {}', '}');
const lcJs = L('/**', ' * @param {number[]} nums', ' * @return {boolean}', ' */', 'var containsDuplicate = function(nums) {', '    ', '};');
assert.deepStrictEqual(computeFix(ncJs, lcJs, 'javascript'), { r: [['hasDuplicate', 'containsDuplicate']], w: ['containsDuplicate'] });

// --- TypeScript: plain function on LeetCode
const ncTs = L('class Solution {', '    twoSum(nums: number[], target: number): number[] {}', '}');
const lcTs = L('function twoSum(nums: number[], target: number): number[] {', '    ', '};');
assert.deepStrictEqual(computeFix(ncTs, lcTs, 'typescript'), { w: ['twoSum'] });

// --- JS design problem: ES6 class on both sides (LeetCode uses var + prototype)
const ncMin = L('class MinStack {', '    constructor() {}', '    push(val) {}', '    pop() {}', '    top() {}', '    getMin() {}', '}');
const lcMin = L('var MinStack = function() {', '    ', '};', '', '/** ', ' * @param {number} val', ' * @return {void}', ' */',
  'MinStack.prototype.push = function(val) {', '    ', '};', 'MinStack.prototype.pop = function() {};', 'MinStack.prototype.top = function() {};', 'MinStack.prototype.getMin = function() {};');
assert.deepStrictEqual(computeFix(ncMin, lcMin, 'javascript'), {});

// --- JS class renamed (PrefixTree -> Trie)
const ncTrie = L('class PrefixTree {', '    constructor() {}', '    insert(word) {}', '    search(word) {}', '    startsWith(prefix) {}', '}');
const lcTrie = L('var Trie = function() {};', 'Trie.prototype.insert = function(word) {};', 'Trie.prototype.search = function(word) {};', 'Trie.prototype.startsWith = function(prefix) {};');
assert.deepStrictEqual(computeFix(ncTrie, lcTrie, 'javascript'), { r: [['PrefixTree', 'Trie']] });

// --- Codec: NeetCode class Codec, LeetCode two plain functions
const ncCodec = L('class Codec {', '    serialize(root) {}', '    deserialize(data) {}', '}');
const lcCodec = L('var serialize = function(root) {};', 'var deserialize = function(data) {};');
assert.deepStrictEqual(computeFix(ncCodec, lcCodec, 'javascript'), { w: ['serialize', 'deserialize'], c: 'Codec' });

// --- unalignable shapes -> null
assert.strictEqual(computeFix(L('class A:', '    def f(self): pass', '    def g(self): pass'), L('class A:', '    def f(self): pass'), 'python3'), null);
assert.strictEqual(computeFix('', lcPy, 'python3'), null);

// --- applyFix: renames respect word boundaries and rename recursive calls too
const userPy = L('class Solution:', '    def hasDuplicate(self, nums):', '        hasDuplicateX = 1', '        return self.hasDuplicate2(nums) or len(set(nums)) < len(nums)');
const outPy = applyFix(userPy, 'python3', { r: [['hasDuplicate', 'containsDuplicate']] });
assert.ok(outPy.code.includes('def containsDuplicate(self, nums)'));
assert.ok(outPy.code.includes('hasDuplicateX = 1'), 'must not touch longer identifiers');
assert.ok(outPy.code.includes('self.hasDuplicate2('), 'must not touch longer identifiers');
assert.deepStrictEqual(outPy.notes, ['renamed hasDuplicate -> containsDuplicate']);

// swapped names do not cascade
const swapped = applyFix('a b a', 'python3', { r: [['a', 'b'], ['b', 'a']] });
assert.strictEqual(swapped.code, 'b a b');

// --- applyFix: JS shim appended only when the class is present
const userJs = L('class Solution {', '    twoSum(nums, target) {', '        return [0, 1];', '    }', '}');
const outJs = applyFix(userJs, 'javascript', { w: ['twoSum'] });
assert.ok(outJs.code.endsWith('var twoSum = function(...args) { return new Solution().twoSum(...args); };\n'), outJs.code);
assert.deepStrictEqual(outJs.notes, ['added javascript shim for twoSum']);
const alreadyLc = applyFix('var twoSum = function(nums, target) { return [0, 1]; };', 'javascript', { w: ['twoSum'] });
assert.strictEqual(alreadyLc.code, 'var twoSum = function(nums, target) { return [0, 1]; };');
assert.deepStrictEqual(alreadyLc.notes, []);

const outTs = applyFix(L('class Solution {', '    twoSum(nums: number[], target: number): number[] { return [0, 1]; }', '}'), 'typescript', { w: ['twoSum'] });
assert.ok(outTs.code.includes('function twoSum(...args: any[]): any { return new Solution().twoSum(...args); }'), outTs.code);

const outCodec = applyFix(L('class Codec {', '    serialize(root) { return ""; }', '    deserialize(data) { return null; }', '}'), 'javascript', { w: ['serialize', 'deserialize'], c: 'Codec' });
assert.ok(outCodec.code.includes('var serialize = function(...args) { return new Codec().serialize(...args); };'), outCodec.code);
assert.ok(outCodec.code.includes('var deserialize = function(...args) { return new Codec().deserialize(...args); };'), outCodec.code);

// --- no fix -> untouched
assert.strictEqual(applyFix(userPy, 'python3', null).code, userPy);

// --- guessFix: JS/TS fallback reads the methods of class Solution
assert.deepStrictEqual(guessFix(L('class Solution {', '    twoSum(nums, target) {', '        if (x) { return 1; }', '        return [0, 1];', '    }', '    helper(a) { return a; }', '}'), 'javascript'), { w: ['twoSum', 'helper'] });
assert.strictEqual(guessFix(userPy, 'python3'), null);

// --- extractIdents ignores comments
assert.deepStrictEqual(extractIdents(L('// class Fake', 'class Real {', '    /* fake(x) */', '    real(x) {}', '}'), 'javascript'), [{ kind: 'class', name: 'Real' }, { kind: 'fn', name: 'real' }]);

// --- reverse direction (LeetCode -> NeetCode)
assert.deepStrictEqual(reverseFix({ r: [['hasDuplicate', 'containsDuplicate']], w: ['containsDuplicate'] }),
  { r: [['containsDuplicate', 'hasDuplicate']], u: ['hasDuplicate'] });
assert.deepStrictEqual(reverseFix({ w: ['serialize', 'deserialize'], c: 'Codec' }), { u: ['serialize', 'deserialize'], c: 'Codec' });
assert.deepStrictEqual(reverseFix({ r: [['PrefixTree', 'Trie']] }), { r: [['Trie', 'PrefixTree']] });
assert.strictEqual(reverseFix(null), null);

// computeFix detects the LeetCode-plain-function -> NeetCode-class shape directly too
assert.deepStrictEqual(computeFix(lcJs, ncJs, 'javascript'), { r: [['containsDuplicate', 'hasDuplicate']], u: ['hasDuplicate'] });
assert.deepStrictEqual(computeFix(lcTs, ncTs, 'typescript'), { u: ['twoSum'] });

// applying the reverse fix to real LeetCode code
const lcUser = L('/**', ' * @param {number[]} nums', ' * @return {boolean}', ' */', 'var containsDuplicate = function(nums) {', '    return new Set(nums).size !== nums.length;', '};');
const rev = applyFix(lcUser, 'javascript', reverseFix({ r: [['hasDuplicate', 'containsDuplicate']], w: ['containsDuplicate'] }));
assert.ok(rev.code.includes('var hasDuplicate = function(nums)'), rev.code);
assert.ok(rev.code.includes('class Solution {') && rev.code.includes('    hasDuplicate(...args) { return hasDuplicate(...args); }'), rev.code);
assert.deepStrictEqual(rev.notes, ['renamed containsDuplicate -> hasDuplicate', 'added javascript class wrapper for hasDuplicate']);
const revTs = applyFix(L('function twoSum(nums: number[], target: number): number[] {', '    return [0, 1];', '};'), 'typescript', { u: ['twoSum'] });
assert.ok(revTs.code.includes('    twoSum(...args: any[]): any { return twoSum(...args); }'), revTs.code);
// already class-shaped code is left alone
const untouched = applyFix(L('class Solution {', '    twoSum(nums, target) { return [0, 1]; }', '}'), 'javascript', { u: ['twoSum'] });
assert.deepStrictEqual(untouched.notes, []);

// guessReverseFix: top-level functions -> class Solution wrapper
assert.deepStrictEqual(guessReverseFix(lcUser, 'javascript'), { u: ['containsDuplicate'] });
assert.deepStrictEqual(guessReverseFix(L('function twoSum(a, b) {}', 'const helper = (x) => x;'), 'javascript'), { u: ['twoSum', 'helper'] });
assert.strictEqual(guessReverseFix(L('class Solution {', '    twoSum() {}', '}'), 'javascript'), null);
assert.strictEqual(guessReverseFix('def f(): pass', 'python3'), null);

console.log('all sigfix tests passed');
