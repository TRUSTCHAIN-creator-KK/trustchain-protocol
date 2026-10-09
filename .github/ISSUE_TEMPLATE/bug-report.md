---
name: Bug report
about: Something in the verifier, the scripts or the docs is wrong
title: "Bug: "
labels: bug
---

**What happened**
The command you ran and what it printed. Paste the output in a code block. The tool prints only the host of an RPC URL, but check the command line you paste: an RPC URL with an API key in it should be cut down to the host. If you used `--record`, do not paste the record file.

**What you expected**

**Your setup**
- Node.js version (`node -v`):
- Operating system:
- RPC host (if you passed `--rpc`), for example polygon.drpc.org. The host only, no API key:

**Record**
The Registry ID you checked, if it is fine to share. Do not paste a private record file, account IDs or emails here.

For a security problem, do not open an issue. Email founder@trustchain.biz instead (see SECURITY.md).
