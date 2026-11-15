'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '@/components/providers/AppProvider';
import { Package, Plus, DollarSign, Tag, Building2, Eye, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function ProductsPage() {
  const { activeBrandId, addToast } = useApp();
  const [products, setProducts] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    brandId: '',
    name: '',
    sku: '',
    category: 'Knitwear',
    description: '',
    unitPriceDollars: '85.00',
    currency: 'USD',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const url =
        activeBrandId && activeBrandId !== 'all'
          ? `/api/products?brandId=${activeBrandId}`
          : '/api/products';
      const [prodRes, brandRes] = await Promise.all([
        fetch(url),
        fetch('/api/brands'),
      ]);
      const prodJson = await prodRes.json();
      const brandJson = await brandRes.json();

      if (prodJson.success) setProducts(prodJson.data);
      if (brandJson.success) {
        setBrands(brandJson.data);
        if (brandJson.data.length > 0 && !formData.brandId) {
          setFormData((prev) => ({ ...prev, brandId: brandJson.data[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeBrandId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const unitPrice = Math.round(parseFloat(formData.unitPriceDollars) * 100);
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId: formData.brandId,
          name: formData.name,
          sku: formData.sku,
          category: formData.category,
          description: formData.description,
          unitPrice,
          currency: formData.currency,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Product "${data.data.name}" added to catalog.`, 'success');
        setShowModal(false);
        setFormData({
          brandId: brands[0]?.id || '',
          name: '',
          sku: '',
          category: 'Knitwear',
          description: '',
          unitPriceDollars: '85.00',
          currency: 'USD',
        });
        fetchData();
      } else {
        addToast(data.error || 'Failed to create product.', 'error');
      }
    } catch {
      addToast('Network error while creating product.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Product Catalog</h2>
          <p className="text-xs text-slate-500 mt-1">
            Fictional items available for synthetic order generation and refund evaluation.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div
              key={p.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {p.brand?.name}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 leading-snug">{p.name}</h3>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    ${(p.unitPrice / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 font-mono">
                  <span>SKU: {p.sku}</span>
                  <span>•</span>
                  <span>{p.category}</span>
                </div>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed line-clamp-2">
                  {p.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">
                  {p._count?.refundRequests || 0} Refund Requests
                </span>
                <Link
                  href={`/generator?brandId=${p.brandId}&productId=${p.id}`}
                  className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-semibold text-[11px]"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Generate 10+10</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">Add Fictional Product</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Brand *
                </label>
                <select
                  value={formData.brandId}
                  onChange={(e) => setFormData({ ...formData, brandId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stealth Hydro Shell"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. STH-SHL-001"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit Price ($ USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="85.00"
                    value={formData.unitPriceDollars}
                    onChange={(e) => setFormData({ ...formData, unitPriceDollars: e.target.value })}
                    className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category *
                </label>
                <input
                  type="text"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Technical specifications or materials..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full text-xs px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
