import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import ProductCard from '../components/ProductCard';

export default function Wishlist() {
  const { wishlist } = useCart();

  return (
    <div className="container-x py-10 fade-in">
      <h1 className="section-title mb-8">My Wishlist</h1>
      {wishlist.length === 0 ? (
        <div className="text-center py-16 border border-sand">
          <p className="text-muted mb-4">Your wishlist is empty.</p>
          <Link to="/shop" className="btn-primary">Discover Products</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-6">
          {wishlist.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
