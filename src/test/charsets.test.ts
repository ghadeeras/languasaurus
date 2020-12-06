import { expect } from 'chai';
import * as charset from '../prod/charsets.js'
import * as utils from '../prod/utils.js';

describe("Charset", () => {

    describe("char", () => {
        const c = charset.char(123);

        it("has only one character", () => {
            expect(c.size).to.equal(1);
        });

        it("contains only the specified character code", () => {
            expect(c.contains(123)).to.be.true;
            expect(c.contains(122)).to.be.false;
            expect(c.contains(124)).to.be.false;
        });

        it("generates the specified character code", () => {
            expect(c.random()).to.equal(123);
        });

        it("is well encapsulated", () => {
            const ranges = c.ranges
            ranges.push(charset.alphabet)
            expect(c.ranges).to.not.deep.equal(ranges)
        })
    });

    describe("except", () => {
        const c = charset.except(123);

        it("has all characters except one", () => {
            expect(c.size).to.equal(charset.all.size - 1);
        });

        it("contains anything except the specified character code", () => {
            expect(c.contains(123)).to.be.false;
            expect(c.contains(122)).to.be.true;
            expect(c.contains(124)).to.be.true;
        });

        it("generates anything except the specified character code", () => {
            expect(c.random()).to.not.equal(123);
        });

        it("is well encapsulated", () => {
            const ranges = c.ranges
            ranges.push(charset.alphabet)
            expect(c.ranges).to.not.deep.equal(ranges)
        })
    });

    describe("range", () => {
        const r = charset.range(123, 321);
        
        it("contains its limits", () => {
            expect(r.contains(123)).to.be.true;
            expect(r.contains(321)).to.be.true;
        });

        it("contains chars within its limits", () => {
            expect(r.contains(124)).to.be.true;
            expect(r.contains(222)).to.be.true;
            expect(r.contains(320)).to.be.true;
        });

        it("does not contain chars outside its limits", () => {
            expect(r.contains(charset.alphabet.min)).to.be.false;
            expect(r.contains(122)).to.be.false;
            expect(r.contains(322)).to.be.false;
            expect(r.contains(charset.alphabet.max)).to.be.false;
        });

        it("allows backward ranges", () => {
            const rBackwards = charset.range(r.ranges[0].max, r.ranges[0].min);
            expect(rBackwards).to.deep.equal(r);
        });

        it("rejects spanning beyong alphabet limits", () => {
            expect(() => charset.range(-1, +1)).to.throw();
            expect(() => charset.range(0, charset.alphabet.max + 1)).to.throw();
        });

        it("is well encapsulated", () => {
            const ranges = r.ranges
            ranges.push(charset.alphabet)
            expect(r.ranges).to.not.deep.equal(ranges)
        })
    });

    describe("union", () => {
        it("contains chars from original sets", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(456, 654);
            const u = charset.union(c1, c2);
            expect(u.contains(c1.random())).to.be.true;
            expect(u.contains(c2.random())).to.be.true;
        });

        it("generates chars from either of original sets", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(456, 654);
            const u = charset.union(c1, c2);
            const char = u.random();
            expect(c1.contains(char) || c2.contains(char)).to.be.true;
        });

        it("has size equal to the sum of sizes of original sets, if they do not overlap", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(456, 654);
            const u = charset.union(c1, c2);
            expect(u.size).to.equal(c1.size + c2.size);
        });

        it("has size equal to the sum of sizes of original sets minus the size of the overlap", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(234, 432);
            const overlap = charset.range(234, 321);
            const u = charset.union(c1, c2);
            expect(u.size).to.equal(c1.size + c2.size - overlap.size);
        });

        it("optimizes ranges", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(322, 456);
            const c3 = charset.range(457, 789);

            const u12 = charset.union(c1, c2);
            const u23 = charset.union(c2, c3);
            const u13 = charset.union(c1, c3);
            const u123 = charset.union(u13, c2);

            const expectedU12 = charset.range(123, 456);
            const expectedU23 = charset.range(322, 789);
            const expectedU123 = charset.range(123, 789);

            expect(u12).to.deep.equal(expectedU12);
            expect(u23).to.deep.equal(expectedU23);
            expect(u123).to.deep.equal(expectedU123);
        });

        it("has identity that is the empty set", () => {
            const c = charset.range(123, 321);

            const cc = charset.union(c, charset.empty);

            expect(cc).to.deep.equal(c);
        });

        it("has zero that is the all set", () => {
            const c = charset.range(123, 321);

            const cc = charset.union(c, charset.all);

            expect(cc).to.deep.equal(charset.all);
        });

        it("is well encapsulated", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(456, 654);
            const u = charset.union(c1, c2);
            const ranges = u.ranges
            ranges.push(charset.alphabet)
            expect(u.ranges).to.not.deep.equal(ranges)
        })
    });

    describe("complement", () => {
        it("does not contain chars from original set", () => {
            const c = charset.range(123, 321);
            const cc = charset.complement(c);
            expect(cc.contains(c.random())).to.be.false;
        });

        it("generates chars from outside original set", () => {
            const c = charset.range(123, 321);
            const cc = charset.complement(c);
            expect(c.contains(cc.random())).to.be.false;
        });

        it("gives original set if applied twice", () => {
            const c = charset.range(123, 321);
            const cc = charset.complement(c);
            const ccc = charset.complement(cc);
            expect(ccc).to.deep.equal(c);
        });

        it("gives all set if unioned with original set", () => {
            const c = charset.range(123, 321);
            const cc = charset.complement(c);
            const u = charset.union(c, cc);
            expect(u).to.deep.equal(charset.all);
        });

        it("gives all set if applied on empty set", () => {
            const c = charset.complement(charset.empty);
            expect(c).to.deep.equal(charset.all);
        });

        it("gives empty set if applied on all set", () => {
            const c = charset.complement(charset.all);
            expect(c).to.deep.equal(charset.empty);
        });

        it("is well encapsulated", () => {
            const c = charset.range(123, 321);
            const cc = charset.complement(c);
            const ranges = cc.ranges
            ranges.push(charset.alphabet)
            expect(cc.ranges).to.not.deep.equal(ranges)
        })
    });

    describe("intersection", () => {
        it("generates chars that exist in all original sets", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(234, 432);
            const i = charset.intersection(c1, c2);
            const char = i.random();
            expect(c1.contains(char) && c2.contains(char)).to.be.true;
        });

        it("gives empty set if original sets do not overlap", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(456, 654);
            const i = charset.intersection(c1, c2);
            expect(i).to.deep.equal(charset.empty);
        });

        it("has identity that is the all set", () => {
            const c = charset.range(123, 321);
            const i = charset.intersection(c, charset.all);
            expect(i).to.deep.equal(c);
        });

        it("has zero that is the empty set", () => {
            const c = charset.range(123, 321);
            const i = charset.intersection(c, charset.empty);
            expect(i).to.deep.equal(charset.empty);
        });

        it("is well encapsulated", () => {
            const c1 = charset.range(123, 321);
            const c2 = charset.range(234, 432);
            const u = charset.intersection(c1, c2);
            const ranges = u.ranges
            ranges.push(charset.alphabet)
            expect(u.ranges).to.not.deep.equal(ranges)
        })
    });

    describe("computeOverlaps", () => {

        it("computes overlps between partially overlaping sets", () => {
            const set1 = charset.range(123, 321);
            const set2 = charset.range(234, 432);

            const overlaps = charset.computeOverlaps(set1, set2);

            expect(overlaps).to.deep.equal([
                utils.pair([0], charset.range(123, 233)),
                utils.pair([0, 1], charset.range(234, 321)),
                utils.pair([1], charset.range(322, 432))
            ]);
        });

        it("computes overlps between identical sets", () => {
            const set = charset.range(123, 321);

            const overlaps = charset.computeOverlaps(set, set);

            expect(overlaps).to.deep.equal([
                utils.pair([0, 1], set)
            ]);
        });

        it("computes overlps between adjacent sets", () => {
            const set1 = charset.range(123, 321);
            const set2 = charset.range(322, 432);

            const overlaps = charset.computeOverlaps(set1, set2);

            expect(overlaps).to.deep.equal([
                utils.pair([0], set1),
                utils.pair([1], set2)
            ]);
        });

        it("computes overlps between barely overlapping sets", () => {
            const set1 = charset.range(123, 321);
            const set2 = charset.range(321, 432);

            const overlaps = charset.computeOverlaps(set1, set2);

            expect(overlaps).to.deep.equal([
                utils.pair([0], charset.range(123, 320)),
                utils.pair([0, 1], charset.char(321)),
                utils.pair([1], charset.range(322, 432))
            ]);
        });

        it("computes overlps between with empty set", () => {
            const set = charset.range(123, 321);

            const overlaps = charset.computeOverlaps(set, charset.empty);

            expect(overlaps).to.deep.equal([
                utils.pair([0], set)
            ]);
        });

        it("computes overlps between with all set", () => {
            const set = charset.range(123, 321);

            const overlaps = charset.computeOverlaps(set, charset.all);

            expect(overlaps).to.deep.equal([
                utils.pair([0, 1], set),
                utils.pair([1], charset.complement(set))
            ]);
        });

        it("computes overlps between sets", () => {
            const set1 = charset.union(charset.range(123, 321), charset.range(456, 654));
            const set2 = charset.union(charset.range(234, 432), charset.range(567, 765));
            const set3 = charset.union(charset.range(345, 543), charset.range(678, 876));

            const sets = [set1, set2, set3];

            const overlaps = charset.computeOverlaps(...sets);

            for (let overlap of overlaps) {
                const intersection = charset.intersection(...sets.map((set, i) => isIn(overlap, i) ? set : charset.complement(set)));
                expect(intersection).to.deep.equal(overlap.value);
                for (let otherOverlap of overlaps) {
                    if (overlap !== otherOverlap) {
                        expect(charset.intersection(overlap.value, otherOverlap.value)).to.deep.equal(charset.empty);
                    }
                }
            }
            const overlapsUnion = charset.union(...overlaps.map(overlap => overlap.value));
            expect(overlapsUnion).to.deep.equal(charset.union(...sets));
        });

    });
});

function isIn(overlap: charset.Overlap, i: number): boolean {
    return overlap.key.indexOf(i) >= 0;
}

