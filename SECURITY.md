# Security

ModelShift reads local fixtures and writes a report to the directory you pass as `--out`. It does not call a model provider, and it does not send suite contents anywhere.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on [Harry0052/modelshift](https://github.com/Harry0052/modelshift/security).

Please do not open a public issue that includes exploit details. A report should describe the affected version, the impact, and a way to reproduce it with a synthetic fixture.

## What to include

- The ModelShift version or git revision.
- The command you ran.
- A minimal fixture that shows the problem, with no production prompts, credentials, or personal data.
