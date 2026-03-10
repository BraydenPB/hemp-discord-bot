/**
 * Discord signature verification using Ed25519
 * Required for all Discord interaction endpoints
 */

export async function verifyKey(body, signature, timestamp, publicKey) {
  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  try {
    const signatureBytes = hexToBytes(signature);
    const timestampBytes = new TextEncoder().encode(timestamp);
    const bodyBytes = new Uint8Array(body);

    // Concatenate timestamp + body
    const messageBytes = new Uint8Array(timestampBytes.length + bodyBytes.length);
    messageBytes.set(timestampBytes);
    messageBytes.set(bodyBytes, timestampBytes.length);

    // Import the public key
    const keyBytes = hexToBytes(publicKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      cryptoKey,
      signatureBytes,
      messageBytes
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
