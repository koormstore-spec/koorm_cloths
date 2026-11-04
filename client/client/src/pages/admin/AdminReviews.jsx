import { useEffect, useState } from 'react';
import adminApi from '../../api/adminAxios';
import AdminLayout from '../../components/AdminLayout';
import Loader from '../../components/Loader';
import StarRating from '../../components/StarRating';
import { AdminConfirm, AdminEmpty, AdminNotice, AdminPagination } from '../../components/admin/AdminUI';

const PAGE_SIZE = 8;

function ReviewReply({ review, replyEndpoint, onReplied }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.admin_reply || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (replyText) => {
    setSaving(true);
    setError('');
    try {
      const { data } = await adminApi.put(`${replyEndpoint}/${review.id}/reply`, { reply: replyText });
      onReplied(data.review);
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the reply. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-3">
        {review.admin_reply && (
          <div className="rounded-lg bg-sand/30 p-3 text-xs leading-5">
            <p className="font-semibold text-ink">Store reply</p>
            <p className="mt-1 text-muted">{review.admin_reply}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => { setText(review.admin_reply || ''); setError(''); setOpen(true); }}
          className="mt-2 text-xs font-semibold text-accent hover:underline"
        >
          {review.admin_reply ? 'Edit reply' : 'Reply'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Write a reply customers will see under this review..."
        className="input-field text-xs"
      />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={saving} onClick={() => save(text)} className="admin-primary px-3 py-1.5 text-xs">
          {saving ? 'Saving...' : 'Save reply'}
        </button>
        {review.admin_reply && (
          <button type="button" disabled={saving} onClick={() => save('')} className="text-xs font-medium text-red-700 hover:underline">
            Remove reply
          </button>
        )}
        <button type="button" disabled={saving} onClick={() => setOpen(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReviewSection({ title, description, endpoint, adminEndpoint, renderSubject }) {
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = (targetPage) => {
    setLoading(true);
    setError('');
    adminApi
      .get(endpoint, { params: { page: targetPage, limit: PAGE_SIZE } })
      .then(({ data }) => {
        setReviews(data.reviews);
        setPage(data.page);
        setPages(data.pages);
        setTotal(data.total);
      })
      .catch(() => setError('Could not load reviews. Please try again.'))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, []);

  const handleDelete = async () => {
    setBusy(true);
    setDeleteError('');
    try {
      await adminApi.delete(`${adminEndpoint}/${deleting.id}`);
      setNotice('Review deleted.');
      load(reviews.length === 1 && page > 1 ? page - 1 : page);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Could not delete this review. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleReplied = (updatedReview) => {
    setReviews((current) => current.map((r) => (r.id === updatedReview.id ? updatedReview : r)));
  };

  const confirmItem = deleting
    ? { ...deleting, name: deleting.comment ? `${deleting.comment.slice(0, 60)}${deleting.comment.length > 60 ? '…' : ''}` : 'this review' }
    : null;

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div><h2 className="admin-panel-title">{title}</h2><p className="mt-1 text-xs text-muted">{description}</p></div>
      </div>
      {error && <div className="p-4 pb-0"><AdminNotice onRetry={() => load(page)}>{error}</AdminNotice></div>}
      {notice && <div className="p-4 pb-0"><AdminNotice success>{notice}</AdminNotice></div>}
      {loading ? (
        <Loader />
      ) : !reviews.length ? (
        <AdminEmpty title="No reviews yet" description="Customer reviews will appear here once submitted." />
      ) : (
        <>
          <div className="divide-y divide-sand">
            {reviews.map((review) => (
              <article key={review.id} className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-6">
                <div className="min-w-0 flex-1">
                  {renderSubject(review)}
                  <div className="mt-2"><StarRating rating={review.rating} /></div>
                  <p className="mt-2 text-sm leading-6 text-muted">{review.comment || 'No written comment.'}</p>
                  <p className="mt-2 text-xs text-muted">{review.user_name} · {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <ReviewReply review={review} replyEndpoint={adminEndpoint} onReplied={handleReplied} />
                </div>
                <button
                  type="button"
                  aria-label={`Delete review by ${review.user_name}`}
                  onClick={() => { setDeleting(review); setDeleteError(''); setNotice(''); }}
                  className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </article>
            ))}
          </div>
          <AdminPagination page={page} pages={pages} total={total} count={reviews.length} pageSize={PAGE_SIZE} onChange={load} />
        </>
      )}
      <AdminConfirm entity="review" item={confirmItem} busy={busy} error={deleteError} onCancel={() => setDeleting(null)} onConfirm={handleDelete} />
    </section>
  );
}

export default function AdminReviews() {
  return (
    <AdminLayout title="Reviews" description="Keep the storefront welcoming — reply to or remove a customer's review.">
      <div className="space-y-6">
        <ReviewSection
          title="Product reviews"
          description="Reviews left on individual products."
          endpoint="/reviews"
          adminEndpoint="/reviews/admin"
          renderSubject={(review) => <p className="text-sm font-semibold">{review.product_name}</p>}
        />
        <ReviewSection
          title="Store reviews"
          description="General reviews shown on the homepage."
          endpoint="/reviews/store"
          adminEndpoint="/reviews/admin/store"
          renderSubject={() => null}
        />
      </div>
    </AdminLayout>
  );
}
