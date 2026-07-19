import { useState } from "react";
import {
  Button,
  Card,
  Dialog,
  Field,
  Input,
  Select,
  Skeleton,
  SkeletonText,
  Tabs,
  Tooltip,
  toast,
} from "../../src/index.js";

export function ControlSpecimens() {
  const [loading, setLoading] = useState(false);
  return (
    <section className="g-section">
      <h2>controls · SPECIMEN</h2>
      <div className="g-stack">
        <Card title="Buttons (loading preserves width)">
          <div className="g-row">
            <Button variant="primary">Add API</Button>
            <Button>Prepare call</Button>
            <Button variant="danger">Quarantine listing</Button>
            <Button variant="ghost">Open in Canton explorer</Button>
            <Button
              variant="primary"
              loading={loading}
              onClick={() => setLoading(true)}
            >
              Prepare call
            </Button>
            <Button variant="ghost" onClick={() => setLoading(false)}>
              Reset loading
            </Button>
          </div>
        </Card>
        <Card title="Field / Input / Select">
          <div className="g-row" style={{ alignItems: "flex-start" }}>
            <Field
              label="Resource route"
              htmlFor="g-route"
              hint="Origin + route, never an ellipsized hostname."
            >
              <Input
                id="g-route"
                mono
                defaultValue="https://api.merchant-ctai.example/fx/usd-cad"
                style={{ width: 320 }}
              />
            </Field>
            <Field
              label="Price"
              htmlFor="g-price"
              error="Canton settlement probe unreachable — retry the probe"
            >
              <Input id="g-price" mono defaultValue="0.25 CC" />
            </Field>
            <Field label="Network" htmlFor="g-network">
              <Select
                id="g-network"
                defaultValue="canton-devnet"
                options={[
                  { value: "canton-devnet", label: "Canton DevNet" },
                  {
                    value: "canton-mainnet",
                    label: "Canton MainNet (not enabled)",
                    disabled: true,
                  },
                ]}
              />
            </Field>
          </div>
        </Card>
        <Card title="Dialog / Tabs / Tooltip / Toast">
          <div className="g-row">
            <Dialog
              trigger={<Button>Review payment authorization</Button>}
              title="Authorize 0.25 CC to merchant-ctai"
              description="Settlement and delivery are recorded separately once the real Canton update commits."
            >
              <div className="g-row">
                <Button variant="primary">Authorize</Button>
                <Button variant="ghost">Cancel</Button>
              </div>
            </Dialog>
            <Tooltip content="Party hint plus fingerprint first/last — copy returns the full value.">
              <Button variant="ghost">Truncation rules</Button>
            </Tooltip>
            <Button
              onClick={() =>
                toast({
                  title: "Draft saved",
                  detail:
                    "Secondary notices only — settlement lands on the rail.",
                })
              }
            >
              Show secondary toast
            </Button>
          </div>
          <Tabs
            label="Evidence views"
            items={[
              {
                value: "summary",
                label: "Summary",
                content: <p style={{ margin: 0 }}>Summary view specimen.</p>,
              },
              {
                value: "journal",
                label: "Journal",
                content: <p style={{ margin: 0 }}>Journal view specimen.</p>,
              },
            ]}
          />
        </Card>
        <Card title="Skeleton (geometry-preserving, no shimmer)">
          <div className="g-row">
            <Skeleton width={220} height={20} />
            <SkeletonText lines={3} />
          </div>
        </Card>
      </div>
    </section>
  );
}
