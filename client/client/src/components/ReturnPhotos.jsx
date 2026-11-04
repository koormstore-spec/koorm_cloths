import { useEffect, useState } from 'react';
import customerApi from '../api/axios';
import adminApi from '../api/adminAxios';

function Photo({ requestId, imageId, index, admin }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let url;
    setError(false);
    setSrc('');
    const api = admin ? adminApi : customerApi;
    api.get(`/returns/${admin ? 'admin/' : ''}${requestId}/images/${imageId}`, { responseType: 'blob' })
      .then(({ data }) => {
        if (!active) return;
        url = URL.createObjectURL(data);
        setSrc(url);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [requestId, imageId, admin, attempt]);
  if (error) return <button type="button" onClick={() => setAttempt(value => value + 1)} className="text-xs underline">Retry photo {index + 1}</button>;
  if (!src) return <span className="text-xs text-muted">Loading photo {index + 1}…</span>;
  return <a href={src} target="_blank" rel="noreferrer" aria-label={`Open clothing photo ${index + 1}`}>
    <img src={src} alt={`Clothing photo ${index + 1}`} className="h-24 w-24 rounded border border-sand object-cover" />
  </a>;
}

export default function ReturnPhotos({ request, admin = false }) {
  if (!request.images?.length) return null;
  return <div className="mt-3"><p className="mb-2 text-xs font-semibold">Clothing photos (select to enlarge)</p>
    <div className="flex flex-wrap gap-3">{request.images.map((image, index) => <Photo key={image.id} requestId={request.id} imageId={image.id} index={index} admin={admin} />)}</div>
  </div>;
}
