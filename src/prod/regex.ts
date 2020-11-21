import * as automaton from './automaton'
import * as sets from './sets'
import * as charset from './charset'

export type State = automaton.State<true>
export type Automaton = automaton.Automaton<true>

export function word(chars: string) {
    const regexes: RegEx[] = []
    for (let i = 0; i < chars.length; i++) {
        const c = chars.charAt(i)
        regexes.push(inRange(c))
    }
    return concat(regexes[0], ...regexes.slice(1))
}

export function oneOf(chars: string) {
    return inRanges(...splitChars(chars))
}

export function noneOf(chars: string) {
    return outOfRanges(...splitChars(chars))
}

export function inRange(r: string) {
    return inRanges(r)
}

export function outOfRange(r: string) {
    return outOfRanges(r)
}

export function inRanges(...rs: string[]) {
    return ranges(false, ...rs)
}

export function outOfRanges(...rs: string[]) {
    return ranges(true, ...rs)
}

function ranges(complement: boolean, ...rs: string[]) {
    const start = newState()
    const end = newEndState()
    const trigger = charset.union(...rs.map(r => 
        charset.range(
            r.charCodeAt(0), 
            r.charCodeAt(r.length - 1)
        )
    ))
    start.on(complement ? charset.complement(trigger) : trigger, end)
    return RegEx.from(automaton.Automaton.create(start))
}

export function concat(regex: RegEx, ...regexes: RegEx[]) {
    const automata = regexes.map(regex => regex.automaton)
    return RegEx.from(automaton.Automaton.concat(regex.automaton, ...automata))
}

export function choice(regex: RegEx, ...regexes: RegEx[]) {
    const automata = regexes.map(regex => regex.automaton)
    return RegEx.from(automaton.Automaton.choice(regex.automaton, ...automata))
}

export function oneOrMore(regex: RegEx) {
    return regex.repetition()
}

export function zeroOrMore(regex: RegEx) {
    return regex.repetition().optional()
}

export class RegEx implements sets.SymbolSet<string> {

    private constructor(readonly automaton: Automaton) {
    }

    contains(s: string) {
        return this.matches(s)
    }

    random() {
        return this.randomString(0.5)
    }

    shortestRandom() {
        return this.randomString(1)
    }

    randomString(shortness: number) {
        const matcher = this.automaton.newMatcher()
        let result: number[] = []
        while (true) {
            if (matcher.recognized.length > 0) {
                if (Math.random() <= shortness) {
                    return String.fromCharCode(...result)
                }
            }
            const nextChar = matcher.randomMatch()
            if (nextChar == null) {
                return String.fromCharCode(...result)
            } 
            result.push(nextChar) 
        }
    }

    matches(s: string): boolean {
        return this.longestMatch(s) == s.length
    }

    find(s: string, from: number = 0): [number, number] | null {
        for (let i = from; i < s.length; i++) {
            const to = this.longestMatch(s, i)
            if (to != null) {
                return [i, to]
            } 
        }
        return null
    }

    longestMatch(s: string, from: number = 0): number | null {
        let lastTo = null
        for (let to of this.matchIndexes(s, from)) {
            lastTo = to
        }
        return lastTo
    }

    shortestMatch(s: string, from: number = 0): number | null {
        for (let to of this.matchIndexes(s, from)) {
            return to
        }
        return null
    }

    *matchIndexes(s: string, from: number = 0) {
        const matcher = this.automaton.newMatcher()
        for (let i = from; i < s.length; i++) {
            if (matcher.recognized.length > 0) {
                yield i
            }
            if (!matcher.match(s.charCodeAt(i))) {
                return
            }
        }
        if (matcher.recognized.length > 0) {
            yield s.length
        }
    }

    optional() {
        return RegEx.from(this.automaton.optional())
    }

    repetition() {
        return RegEx.from(this.automaton.repetition())
    }

    then(r: RegEx) {
        return concat(this, r)
    }

    or(r: RegEx) {
        return choice(this, r)
    }

    static from(automaton: Automaton) {
        return new RegEx(automaton.deterministic())
    }

}

function newState(): State {
    return automaton.State.create()
}

function newEndState(): State {
    return automaton.State.create(true)
}

function splitChars(chars: string) {
    const ranges: string[] = []
    for (let i = 0; i < chars.length; i++) {
        ranges.push(chars.charAt(i))
    }
    return ranges
}
