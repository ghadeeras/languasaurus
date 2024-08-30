export type Equality<T> = (v1: T, v2: T) => boolean;
export type Comparator<T> = (v1: T, v2: T) => number;
export type Reducer<A, B> = (a: A, b: B) => A;
export type Getter<A, B> = (a: A) => B;
export type Mapper<A, B> = (a: A, i: number) => B;
export type Consumer<T> = (v: T) => void
export type Producer<T> = Consumer<Consumer<T>>

export type Pair<K, V> = {
    key: K;
    value: V;
}

export function pair<K, V>(key: K, value: V): Pair<K, V> {
    return {
        key: key,
        value: value
    };
}

export function distinctFunction<T>(comparator: Comparator<T>): Getter<T[], T[]> {
    return array => distinct<T>(array, comparator);
}

export function distinct<T>(array: T[], comparator: Comparator<T>): T[] {
    return aggregate(array, v => v, v => v, comparator, v => v, v => v).map(r => r.value);
}

export function groupFunction<T, K, V>(key: Getter<T, K>, value: Getter<T, V>, keyComparator: Comparator<K>): Getter<T[], Pair<K, V[]>[]> {
    return array => group(array, key, value, keyComparator)
}

export function group<T, K, V>(array: T[], key: Getter<T, K>, value: Getter<T, V>, keyComparator: Comparator<K>): Pair<K, V[]>[] {
    return aggregate(array, key, value, keyComparator, () => new Array<V>(), append)
}

export function aggregateFunction<K, V, R>(keyComparator: Comparator<K>, aggregateIdentity: Getter<K, R>, aggregateReducer: Reducer<R, V>): Getter<Pair<K, V>[], Pair<K, R>[]> {
    return array => aggregate(array, r => r.key, r => r.value, keyComparator, aggregateIdentity, aggregateReducer);
}

export function aggregate<T, K, V, R>(array: T[], key: Getter<T, K>, value: Getter<T, V>, keyComparator: Comparator<K>, aggregateIdentity: Getter<K, R>, aggregateReducer: Reducer<R, V>): Pair<K, R>[] {
    const result: Pair<K, R>[] = [];
    const comparator = comparing(key, keyComparator);
    array.sort(comparator).forEach(item => {
        const k = key(item);
        const v = value(item);
        const lastItem = result.pop();
        if (lastItem) {
            if (keyComparator(lastItem.key, k) == 0) {
                result.push(pair(k, aggregateReducer(lastItem.value, v)));
            } else {
                result.push(lastItem);
                result.push(pair(k, aggregateReducer(aggregateIdentity(k), v)));
            }
        } else {
            result.push(pair(k, aggregateReducer(aggregateIdentity(k), v)));
        }
    });
    return result;
}

export function removeFirst<T>(toRemove: T, array: T[], comparator: Comparator<T>): T[] {
    const index = array.findIndex(item => comparator(item, toRemove) == 0);
    return index >= 0 ? array.slice(0, index).concat(array.slice(index + 1)) :  array;
}

export const numberComparator: Comparator<number> = (v1, v2) => v1 - v2;

export function arrayComparator<T>(comparator: Comparator<T>): Comparator<T[]> {
    return (array1, array2) => {
        const minLength = Math.min(array1.length, array2.length);
        let result = 0;
        for (let i = 0; i < minLength && result == 0; i++) {
            result = comparator(array1[i], array2[i]);
        }
        if (result == 0) {
            result = array1.length - array2.length;
        }
        return result;
    }
}

export function comparing<A, B>(getter: Getter<A, B>, comparator: Comparator<B>): Comparator<A> {
    return (a1, a2) => comparator(getter(a1), getter(a2))
}

export function comparingBy<A>(...comparators: Comparator<A>[]): Comparator<A> {
    return (a1, a2) => {
        for (const comparator of comparators) {
            const diff = comparator(a1, a2)
            if (diff != 0) {
                return diff
            }
        }
        return 0
    }
}

export function flatten<T>(array: T[][]): T[] {
    return flatMap(array, v => v);
}

export function flatMap<I, O>(array: I[], mapper: Mapper<I, O[]>): O[] {
    const result: O[] = [];
    array.map(mapper).forEach(os => os.forEach(o => result.push(o)));
    return result;
}

export function unique<T>(values: T[]): T[] {
    const vs: T[] = []
    for (const v of values) {
        if (vs.indexOf(v) < 0) {
            vs.push(v)
        }
    }
    return vs
}

export function append<V>(group: V[], v: V) {
    group.push(v);
    return group;
}

export function randomInt(max: number): number {
    return Math.floor(Math.random() * Math.floor(max));
}

export function bug<T>(): T {
    throw new Error("Should never happen!!!")
}

export type Expression<T> = () => T 
export type LazyEvaluator = <T>(expression: Expression<T>) => SimplePromise<T>  
export type AsyncExpression<T> = (evaluator: LazyEvaluator) => SimplePromise<T> 

export function evaluate<T>(asyncExpression: AsyncExpression<T>): T {
    const evaluator = new LazyEvaluatorImpl()
    const promise = asyncExpression(expression => evaluator.evaluate(expression))
    return evaluator.await(promise)
}

class LazyEvaluatorImpl {

    private resolutions: (() => void)[] = []

    evaluate<T>(expression: () => T): SimplePromise<T> {
        return new SimplePromise(
            resolution => this.resolutions.push(resolution), 
            consumer => this.resolutions.push(() => consumer(expression()))
        )
    }

    await<T>(promise: SimplePromise<T>): T {
        const result: T[] = []
        promise.then(value => result.push(value))
        while (this.resolutions.length > 0 && result.length == 0) {
            const resolution = this.resolutions.shift()
            if (resolution !== undefined) {
                resolution()
            }
        }
        if (result.length === 0) {
            throw new Error("Could not resolve promise!!!")
        }
        return result[0]
    }

}

export class SimplePromise<T> {

    private result: T[] = []
    private consumers: Consumer<T>[] = []

    constructor(private defer: Consumer<() => void>, producer: Producer<T>) {
        producer(value => this.resolve(value))
    }

    private resolve(value: T) {
        if (this.result.length > 0) {
            throw new Error("Only one resolution is expected!")
        }
        this.result.push(value);
        while (this.consumers.length > 0) {
            const consumer = this.consumers.shift();
            if (consumer !== undefined) {
                this.defer(() => consumer(value));
            }
        }
    }

    private attach(consumer: Consumer<T>) {
        if (this.result.length > 0) {
            this.defer(() => consumer(this.result[0]))
        } else {
            this.consumers.push(consumer)
        }
    }

    then<R>(mapper: (value: T) => R | SimplePromise<R>): SimplePromise<R> {
        return new SimplePromise(this.defer, consumer => {
            this.attach(value => {
                const result = mapper(value);
                if (result instanceof SimplePromise) {
                    result.attach(consumer)
                } else {
                    consumer(result)
                }
            })
        })
    }

}
