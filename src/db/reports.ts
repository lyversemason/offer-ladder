// The built-in reports. Each one is a plain .sql file in ./queries with a
// plain-English header; this list gives each a title and the question it answers.
import repScorecard from './queries/1-rep-scorecard.sql?raw'
import storeComparison from './queries/2-store-comparison.sql?raw'
import tierMix from './queries/3-tier-mix.sql?raw'
import whereDealsClose from './queries/4-where-deals-close.sql?raw'
import attachTrend from './queries/5-attach-trend.sql?raw'
import premiumShare from './queries/6-premium-share.sql?raw'
import exceptions from './queries/7-exceptions.sql?raw'

export interface Report {
  id: string
  title: string
  question: string
  /** The query file name, for the "Show the SQL" view and the SQL guide. */
  file: string
  sql: string
}

export const REPORTS: Report[] = [
  {
    id: 'rep-scorecard',
    title: 'Rep scorecard by month',
    question: 'How did each rep do each month: ups, conversion, sales, margin, attach and commission?',
    file: '1-rep-scorecard.sql',
    sql: repScorecard,
  },
  {
    id: 'store-comparison',
    title: 'Store comparison',
    question: 'How do the two stores compare over the whole period?',
    file: '2-store-comparison.sql',
    sql: storeComparison,
  },
  {
    id: 'tier-mix',
    title: 'Tier mix by rep',
    question: "How much of each rep's business lands in each commission tier?",
    file: '3-tier-mix.sql',
    sql: tierMix,
  },
  {
    id: 'where-deals-close',
    title: 'Where deals close on the ladder',
    question: 'At which offer do customers say yes, and what does each step cost?',
    file: '4-where-deals-close.sql',
    sql: whereDealsClose,
  },
  {
    id: 'attach-trend',
    title: 'Adjustable-base attach by month',
    question: 'Is the share of sales with an adjustable base going up or down?',
    file: '5-attach-trend.sql',
    sql: attachTrend,
  },
  {
    id: 'premium-share',
    title: 'Premium line by rep',
    question: 'Who sells the price-locked premium line, and do they still make margin on it?',
    file: '6-premium-share.sql',
    sql: premiumShare,
  },
  {
    id: 'exceptions',
    title: 'Exceptions: under the final offer',
    question: 'Who gives the most margin away: low-tier sales, and sales under the ladder\'s final offer?',
    file: '7-exceptions.sql',
    sql: exceptions,
  },
]
