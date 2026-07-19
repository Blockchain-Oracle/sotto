import {
  Badge,
  Button,
  Card,
  CodeBlock,
  CopyChip,
  Deadline,
  RestState,
  StateChipPair,
  Table,
  Veil,
  formatAmount,
  formatUtc,
} from "../../src/index.js";
import {
  SPECIMEN_CHALLENGE,
  SPECIMEN_MERCHANT_PARTY,
  SPECIMEN_OWNER_PARTY,
  SPECIMEN_UPDATE_ID,
  at,
} from "../specimen-data.js";

export function EvidenceSpecimens() {
  return (
    <section className="g-section">
      <h2>evidence · SPECIMEN</h2>
      <div className="g-stack">
        <Card title="Paired outcomes (never a generic Success)">
          <div className="g-row">
            <StateChipPair settlement="pending" delivery="pending" />
            <StateChipPair settlement="settled" delivery="pending" />
            <StateChipPair settlement="settled" delivery="delivered" />
            <StateChipPair settlement="settled" delivery="failed" />
            <StateChipPair settlement="failed" delivery="pending" />
          </div>
        </Card>
        <Card title="Copy chips (copies the FULL value)">
          <div className="g-row">
            <CopyChip value={SPECIMEN_OWNER_PARTY} kind="party" />
            <CopyChip value={SPECIMEN_MERCHANT_PARTY} kind="party" />
            <CopyChip value={SPECIMEN_UPDATE_ID} kind="update" />
          </div>
        </Card>
        <Card title="Attempts" aside={<Badge tone="ambra">Devnet</Badge>}>
          <Table label="Attempts (specimen)">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Amount</th>
                <th>Settlement · Delivery</th>
                <th>At (UTC)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>fx/usd-cad</td>
                <td className="sv-num">{formatAmount("0.25", "CC")}</td>
                <td>
                  <StateChipPair settlement="settled" delivery="delivered" />
                </td>
                <td className="sv-num">{formatUtc(at(15))}</td>
              </tr>
              <tr>
                <td>fx/usd-chf</td>
                <td className="sv-num">{formatAmount("0.25", "CC")}</td>
                <td>
                  <StateChipPair settlement="settled" delivery="failed" />
                </td>
                <td className="sv-num">{formatUtc(at(87))}</td>
              </tr>
            </tbody>
          </Table>
        </Card>
        <Card title="Veil — filigrana redaction">
          <div className="g-row">
            <Veil reason="Private resource context" minHeight={56} />
            <Veil reason="Private resource context" veiled={false}>
              <CodeBlock code={'{ "quote": "1.3712" }'} label="RESPONSE" />
            </Veil>
          </div>
        </Card>
        <Card title="402 challenge">
          <CodeBlock
            code={SPECIMEN_CHALLENGE}
            label="402 CHALLENGE · SPECIMEN"
          />
        </Card>
        <Card title="Deadline (the only time-driven element)">
          <Deadline
            label="Execute before"
            until={new Date(Date.now() + 10 * 60 * 1000)}
          />
        </Card>
        <Card title="Rest state">
          <RestState
            title="No settlements recorded"
            detail="The first real Canton update lands here as an engraved mark."
            action={<Button variant="primary">Add API</Button>}
          />
        </Card>
      </div>
    </section>
  );
}
