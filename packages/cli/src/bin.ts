#!/usr/bin/env node
import { run } from "./run.js";

const io = {
  stdout: (line: string) => process.stdout.write(`${line}\n`),
  stderr: (line: string) => process.stderr.write(`${line}\n`),
  env: process.env,
  isTTY: process.stdout.isTTY === true,
};

const exitCode = await run(process.argv.slice(2), {
  io,
  env: process.env,
  mcpStreams: {
    input: process.stdin,
    write: (frame) => void process.stdout.write(frame),
    logError: (line) => void process.stderr.write(`${line}\n`),
  },
});
process.exitCode = exitCode;
