// Turns a verification result into plain text for the terminal.

const MARK = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };

function row(label, value) {
  return `  ${label.padEnd(26)}${value}`;
}

function emptySlot(address) {
  return /^0x0{40}$/i.test(address || '') ? 'empty (zero address)' : address;
}

/**
 * @param {{ok: boolean, publicId: string, checks: object[], facts: object}} result
 * @returns {string}
 */
export function formatReport(result) {
  const { checks, facts } = result;
  const lines = [];
  lines.push(`TrustChain record check for Registry ID ${result.publicId}`);
  lines.push('');

  for (const c of checks) {
    lines.push(`${MARK[c.status]}  ${c.label}`);
    lines.push(`      ${c.detail}`);
  }

  lines.push('');
  lines.push('Facts read');
  lines.push(row('Registry ID', facts.publicId));
  if (facts.recordStatus) lines.push(row('Record status', `${facts.recordStatus} (from TrustChain)`));
  if (facts.title !== undefined) lines.push(row('Title', `"${facts.title}" (from TrustChain)`));
  const sigs = facts.signaturesReportedByServer;
  if (sigs && typeof sigs === 'object') {
    const parts = ['originator', 'counterparty'].map((side) => {
      const s = sigs[side] || {};
      return `${side} ${s.signed ? `signed ${s.signedAt || ''}`.trim() : 'not signed'}`;
    });
    lines.push(row('Signatures', `${parts.join(', ')} (from TrustChain, not on-chain)`));
  }
  if (facts.internalRecordId) lines.push(row('Internal record ID', `${facts.internalRecordId} (from the transaction)`));
  if (facts.fingerprintShown) lines.push(row('Fingerprint shown', facts.fingerprintShown));
  if (facts.fingerprintStored) lines.push(row('Fingerprint on-chain', facts.fingerprintStored));
  if (facts.fingerprintRecomputed) lines.push(row('Fingerprint from file', facts.fingerprintRecomputed));
  if (facts.transactionHash) lines.push(row('Transaction', facts.transactionHash));
  if (facts.blockNumber !== undefined) lines.push(row('Block', String(facts.blockNumber)));
  if (facts.blockTime) lines.push(row('Block time (UTC)', facts.blockTime));
  if (facts.serverAnchoredAt) lines.push(row('Time TrustChain saved it', `${facts.serverAnchoredAt} (server clock, not the chain)`));
  if (facts.sender) lines.push(row('Sent by', facts.sender));
  if (facts.contract) lines.push(row('Contract', facts.contract));
  if (facts.creatorSlot !== undefined) lines.push(row('Creator wallet slot', emptySlot(facts.creatorSlot)));
  if (facts.counterpartySlot !== undefined) lines.push(row('Counterparty wallet slot', emptySlot(facts.counterpartySlot)));
  if (facts.rpcUrls) lines.push(row('RPC used', facts.rpcUrls.join(', ')));

  const required = checks.filter((c) => !c.optional);
  const failed = checks.filter((c) => c.status === 'fail');
  const fileChecked = checks.some((c) => c.optional && c.status === 'pass');
  lines.push('');
  if (result.ok) {
    lines.push(
      `Result: PASS. All ${required.length} required checks passed.` +
        (fileChecked ? ' The record file matches too.' : ' No record file was checked.'),
    );
  } else {
    lines.push(`Result: FAIL. ${failed.length} check(s) failed. Read the FAIL lines above.`);
  }

  if (result.ok) {
    lines.push('');
    lines.push('What these checks show');
    lines.push(
      `- The fingerprint ${facts.fingerprintStored} was written to the TrustChain registry on Polygon` +
        ` in block ${facts.blockNumber} at ${facts.blockTime}, by TrustChain's anchoring wallet.`,
    );
    lines.push(
      `- The registry still holds it under internal record ID "${facts.internalRecordId}".` +
        ' The contract has no function that changes or deletes an entry.',
    );
    lines.push(`- TrustChain's public endpoint reports the same fingerprint for Registry ID ${facts.publicId}.`);
    if (fileChecked) {
      lines.push(
        '- The record file hashes to that fingerprint. So its title, terms text, amount and the two account IDs' +
          ` existed in exactly this form no later than ${facts.blockTime}.`,
      );
    }
  }

  lines.push('');
  lines.push('What these checks do not show');
  if (!fileChecked) {
    lines.push(
      '- What the fingerprint was made from. That needs the record file, which holds private account IDs.' +
        ' The agreement text alone cannot reproduce it.',
    );
  }
  lines.push(
    '- Who the people are, or that anyone signed. Signatures and their times come from TrustChain\'s database,' +
      ' not from the chain.',
  );
  lines.push(
    '- That this Registry ID belongs to this anchor, beyond TrustChain\'s word. The Registry ID is not on-chain.' +
      ' The link is the transaction TrustChain\'s endpoint names.',
  );
  lines.push(
    '- The currency, or anything on the record page besides the title, terms text, amount and the two account IDs.',
  );
  lines.push('');
  lines.push('Not legal advice.');
  return lines.join('\n');
}
