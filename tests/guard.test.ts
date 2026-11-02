// The demo must never contain the real retailer's name, real brands, its systems
// or real people. This test holds only fingerprints (SHA-256) of those names, so
// the names themselves never appear in the repo either. It reads every text file
// and checks each word, and each run of two or three words, against the list.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BANNED = new Set([
  'a62118088aadcb8f', '4792701f8e882368', '1a7143c096dbb2fc', 'c1e3475bdd443053',
  'beb5018b37c8c74e', 'e4753acc7f2f86d2', '45a8e1a20e122398', 'c3104445eb8e9bb8',
  'cd8028c53afbf333', 'eb59a285c6e89ea8', 'a2c230bcf52e5664', '81fdff283ec2829b',
  '7433b226fc8ff5c5', 'b20c8d1634f2e1a4', '67e2f08d2719844a', '059368f98deb5c79',
  'ca492a96e17f1534', 'f79f272c562abe62', 'ea20cd01f3b9ca88', 'e75be06c6549cf50',
  '142f6d7114a1a473', '6e34a1a875904264', 'a288feaf000bce46', '951cb0a7e524e3c9',
])

const TEXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.css', '.sql', '.csv', '.yml', '.txt', '.svg', '.toml'])
const SKIP = new Set(['node_modules', 'dist', '.git', '.claude', 'package-lock.json'])
const root = join(import.meta.dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return TEXT.has(extname(name)) || name.startsWith('.') ? [path] : []
  })
}

const fingerprint = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function hits(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const found: string[] = []
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      const phrase = words.slice(i, i + n).join(' ')
      if (BANNED.has(fingerprint(phrase)) || (n > 1 && BANNED.has(fingerprint(words.slice(i, i + n).join(''))))) {
        found.push(phrase)
      }
    }
  }
  return found
}

describe('no real names in the repo', () => {
  const all = files(root)

  it('scans the project files', () => {
    expect(all.length).toBeGreaterThan(10)
  })

  it('finds none of the banned names in any file', () => {
    const problems = all.flatMap((f) => hits(readFileSync(f, 'utf8')).map((h) => `${f.slice(root.length + 1)}: "${h}"`))
    expect(problems).toEqual([])
  })

  it('really does catch a banned name (checks itself)', () => {
    // Spelled backwards so this file doesn't contain the word.
    expect(hits([...'snommiS'].reverse().join('')).length).toBe(1)
    expect(hits('fine words only')).toEqual([])
  })
})
