import { expect } from 'chai';
import * as utils from "../prod/utils.js";

describe("utils", () => {

    const numberComparator: utils.Comparator<number> = (v1, v2) => v1 - v2;
    const stringComparator: utils.Comparator<string> = (s1, s2) => s1.localeCompare(s2);
    const sum: utils.Reducer<number, number> = (v1, v2) => v1 + v2;
    const aggregate = utils.aggregateFunction(stringComparator, () => 0, sum);
    const distinct = utils.distinctFunction(numberComparator);
    
    describe("aggregate", () => {

        it("aggregates values", () => {
            const array = [
                utils.pair("a", 1),
                utils.pair("a", 2),
                utils.pair("a", 3),
                utils.pair("b", 4),
                utils.pair("b", 5)
            ];

            const result = aggregate(array);

            expect(result).to.deep.equal([
                utils.pair("a", 6),
                utils.pair("b", 9)
            ]);
        });

        it("works even if input is not sorted", () => {
            const array = [
                utils.pair("a", 1),
                utils.pair("b", 4),
                utils.pair("a", 2),
                utils.pair("b", 5),
                utils.pair("a", 3)
            ];

            const result = aggregate(array);

            expect(result).to.deep.equal([
                utils.pair("a", 6),
                utils.pair("b", 9)
            ]);
        });

        it("returns one-to-one results if input has unique keys", () => {
            const array = [
                utils.pair("a", 1),
                utils.pair("b", 2),
                utils.pair("c", 3),
                utils.pair("d", 4),
                utils.pair("e", 5)
            ];

            const result = aggregate(array);

            expect(result).to.deep.equal(array);
        });

    });

    describe("distinct", () => {

        it("returns distinct values", () => {
            const array = [1, 1, 2, 3, 2, 1, 2, 1, 4, 3];

            const result = distinct(array);

            expect(result).to.deep.equal([1, 2, 3, 4]);
        });

    });

    describe("arrayComparator", () => {
        const comparator: utils.Comparator<number[]> = utils.arrayComparator(numberComparator);

        it("compares arrays", () => {
            const array0: number[] = [];
            const array1 = [1, 2, 3];
            const array2 = [1, 2, 4];
            const array3 = [1, 3, 0];
            const array4 = [1, 2];
            const array5 = [1, 2, 3, 4];
            const array6 = [1, 2, 3];

            expect(comparator(array0, array1)).to.be.lessThan(0);
            expect(comparator(array1, array0)).to.be.greaterThan(0);

            expect(comparator(array1, array2)).to.be.lessThan(0);
            expect(comparator(array2, array1)).to.be.greaterThan(0);

            expect(comparator(array2, array3)).to.be.lessThan(0);
            expect(comparator(array3, array2)).to.be.greaterThan(0);

            expect(comparator(array1, array4)).to.be.greaterThan(0);
            expect(comparator(array4, array1)).to.be.lessThan(0);

            expect(comparator(array1, array5)).to.be.lessThan(0);
            expect(comparator(array5, array1)).to.be.greaterThan(0);

            expect(comparator(array1, array6)).to.equal(0);
            expect(comparator(array6, array1)).to.equal(0);
        });
    });

    describe("removeFirst", () => {

        it("removes first occurence of an item in an array", () => {
            const array = [1, 4, 7, 0, 3, 6, 4, 9, 2, 5, 8];

            const result1 = utils.removeFirst(4, array, numberComparator);
            const result2 = utils.removeFirst(4, array.reverse(), numberComparator).reverse();

            expect(result1).to.deep.equal([1, 7, 0, 3, 6, 4, 9, 2, 5, 8]);
            expect(result2).to.deep.equal([1, 4, 7, 0, 3, 6, 9, 2, 5, 8]);
        });

        it("handles occurences at the edges", () => {
            const array = [1, 4, 7, 0, 3, 6, 4, 9, 2, 5, 8];

            const result1 = utils.removeFirst(1, array, numberComparator);
            const result2 = utils.removeFirst(8, array, numberComparator);

            expect(result1).to.deep.equal([4, 7, 0, 3, 6, 4, 9, 2, 5, 8]);
            expect(result2).to.deep.equal([1, 4, 7, 0, 3, 6, 4, 9, 2, 5]);
        });

        it("handles arrays with single elements", () => {
            const array = [6];

            const result = utils.removeFirst(6, array, numberComparator);

            expect(result).to.be.empty;
        });

        it("returns same array if no occurences are found", () => {
            const array = [1, 4, 7, 0, 3, 4, 9, 2, 5, 8];

            const result1 = utils.removeFirst(6, array, numberComparator);
            const result2 = utils.removeFirst(6, [], numberComparator);

            expect(result1).to.deep.equal(array);
            expect(result2).to.be.empty;
        });

    });

    describe("flatMap", () => {

        it("flattens arrays", () => {
            const array = [
                [1, 2, 3],
                [4],
                [],
                [5],
                [6, 7, 8]
            ]

            const result = utils.flatten(array);

            expect(result).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8]);
        });

    })

})