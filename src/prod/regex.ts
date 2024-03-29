import * as automata from './automata.js'
import * as sets from './sets.js'
import * as charsets from './charsets.js'

export type State = automata.State<true>
export type Automaton = automata.Automaton<true>

export function state(): State {
    return automata.State.create()
}

export function endState(): State {
    return automata.State.create(true)
}

export function from(state: State) {
    return RegEx.create(automata.Automaton.create(state))
}

export function word(w: string) {
    return chars(w)
}

export function chars(cs: string) {
    const regexes: RegEx[] = []
    for (let i = 0; i < cs.length; i++) {
        const c = cs.charAt(i)
        regexes.push(charIn(c))
    }
    return concat(regexes[0], ...regexes.slice(1))
}

export function char(c: string) {
    return charFrom(c)
}

export function charOtherThan(c: string) {
    return charNotFrom(c)
}

export function charFrom(chars: string) {
    const [range, ...ranges] = splitChars(chars) 
    return charIn(range, ...ranges)
}

export function charNotFrom(chars: string) {
    const [range, ...ranges] = splitChars(chars) 
    return charOutOf(range, ...ranges)
}

export function charIn(range: string, ...ranges: string[]) {
    return charRanges(false, [range, ...ranges])
}

export function charOutOf(range: string, ...ranges: string[]) {
    return charRanges(true, [range, ...ranges])
}

function charRanges(complement: boolean, rs: string[]) {
    const start = newState()
    const end = newEndState()
    const trigger = charsets.union(...rs.map(r => 
        charsets.range(
            r.charCodeAt(0), 
            r.charCodeAt(r.length - 1)
        )
    ))
    start.on(complement ? charsets.complement(trigger) : trigger, end)
    return RegEx.create(automata.Automaton.create(start))
}

export function concat(regex: RegEx, ...regexes: RegEx[]) {
    const allAutomata = regexes.map(regex => regex.automaton)
    return RegEx.create(automata.Automaton.concat(regex.automaton, ...allAutomata))
}

export function choice(regex: RegEx, ...regexes: RegEx[]) {
    const allAutomata = regexes.map(regex => regex.automaton)
    return RegEx.create(automata.Automaton.choice(regex.automaton, ...allAutomata))
}

export function oneOrMore(regex: RegEx) {
    return regex.repeated()
}

export function zeroOrMore(regex: RegEx) {
    return regex.repeated().optional()
}

export class RegEx implements sets.SymbolSet<string> {

    private constructor(private _automaton: Automaton) {
    }

    get automaton() {
        return this._automaton.clone()
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
        const matcher = this._automaton.newMatcher()
        const result: number[] = []
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

    find(s: string, from = 0): [number, number] | null {
        for (let i = from; i < s.length; i++) {
            const to = this.longestMatch(s, i)
            if (to != null) {
                return [i, to]
            } 
        }
        return null
    }

    longestMatch(s: string, from = 0): number | null {
        let lastTo = null
        for (const to of this.matchIndexes(s, from)) {
            lastTo = to
        }
        return lastTo
    }

    shortestMatch(s: string, from = 0): number | null {
        for (const to of this.matchIndexes(s, from)) {
            return to
        }
        return null
    }

    *matchIndexes(s: string, from = 0) {
        const matcher = this._automaton.newMatcher()
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
        return RegEx.create(this._automaton.optional())
    }

    repeated() {
        return RegEx.create(this._automaton.repeated())
    }

    then(r: RegEx) {
        return concat(this, r)
    }

    or(r: RegEx) {
        return choice(this, r)
    }

    static create(automaton: Automaton) {
        return new RegEx(automaton.deterministic())
    }

}

function newState(): State {
    return automata.State.create()
}

function newEndState(): State {
    return automata.State.create(true)
}

function splitChars(chars: string) {
    const ranges: string[] = []
    for (let i = 0; i < chars.length; i++) {
        ranges.push(chars.charAt(i))
    }
    return ranges
}
