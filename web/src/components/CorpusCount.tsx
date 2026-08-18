import CountUp from './CountUp';

/**
 * The indexed-section count, animated on view. Kept as a component with the
 * number passed in rather than hardcoded in copy — the last two times this
 * number lived inline in prose it went stale within hours of an ingest.
 */
export default function CorpusCount({ n }: { n: number }) {
  return <CountUp to={n} from={0} duration={1.1} separator="," className="corpus-count" />;
}
