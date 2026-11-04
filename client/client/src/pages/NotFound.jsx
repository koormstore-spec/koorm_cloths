import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container-x py-32 text-center">
      <h1 className="font-serif text-6xl mb-4">404</h1>
      <p className="text-muted mb-8">The page you're looking for doesn't exist.</p>
      <Link to="/" className="btn-primary">Back to Home</Link>
    </div>
  );
}
