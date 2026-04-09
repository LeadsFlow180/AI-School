'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Page() {
  const searchParams = useSearchParams();
  const [decoded, setDecoded] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const payload = searchParams.get('payload');
    const sig = searchParams.get('sig');

    if (!payload || !sig) {
      setError('Missing payload or sig');
      return;
    }

    const secret = '6647c35952824de9b0b714381ba19a473cb8359c7e6b4394b92b80a8075f9990';

    try {
      // Decode base64url
      const decodedStr = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const obj = JSON.parse(decodedStr);

      // Verify signature
      crypto.subtle
        .importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        )
        .then((key) => {
          return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
        })
        .then((signature) => {
          const computedSig = Array.from(new Uint8Array(signature))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          if (computedSig !== sig) {
            setError('Invalid signature');
            return;
          }

          setDecoded(obj);
          console.log('Decoded payload:', obj);

          // Call API to store data
          const callApi = async () => {
            try {
              const response = await fetch('/api/learn/redirect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload, sig }),
              });
              console.log('API response:', response.status);
            } catch (e) {
              console.error('Failed to call API:', e);
            }
          };
          callApi();

          // Open redirect URL in new tab
          const redirectUrl = `/classroom/${obj.sectionId}?${searchParams.toString()}`;
          window.open(redirectUrl, '_blank');
        })
        .catch((e) => {
          setError('Error: ' + e.message);
        });
    } catch (e) {
      setError('Error decoding: ' + e.message);
    }
  }, [searchParams]);

  if (error) {
    return <div>{error}</div>;
  }

  if (!decoded) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Class Session</h1>
      <pre>{JSON.stringify(decoded, null, 2)}</pre>
    </div>
  );
}
