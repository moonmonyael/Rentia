import React, { useState } from 'react';
import { X, Building2, Euro, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { Language, TRANSLATIONS } from '../i18n/translations';

interface CreateListingModalProps {
  onClose: () => void;
  onListingCreated: () => void;
  currentUserEmail?: string;
  language: Language;
}

export const CreateListingModal: React.FC<CreateListingModalProps> = ({
  onClose,
  onListingCreated,
  currentUserEmail,
  language
}) => {
  const t = TRANSLATIONS[language];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    city: 'Málaga',
    neighborhood: 'Centro / Soho',
    address: '',
    rent: 850,
    deposit: 850,
    currency: '€',
    property_type: 'apartment',
    rooms_count: 2,
    surface_sqm: 55,
    available_from: '2026-09-01',
    pets_allowed: true,
    furnished: true,
    min_income_required: 2100,
    image_url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80',
    landlord_name: currentUserEmail || t.certifiedLandlord,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        city: formData.city,
        neighborhood: formData.neighborhood,
        address: formData.address,
        rent: Number(formData.rent),
        deposit: Number(formData.deposit),
        currency: formData.currency,
        property_type: formData.property_type,
        rooms_count: Number(formData.rooms_count),
        surface_sqm: Number(formData.surface_sqm),
        available_from: formData.available_from,
        pets_allowed: formData.pets_allowed,
        furnished: formData.furnished,
        min_income_required: Number(formData.min_income_required),
        images: [formData.image_url],
        landlord_name: formData.landlord_name,
        landlord_verified: true,
      };

      await api.matching.createListing(payload);
      setSuccess(true);
      setTimeout(() => {
        onListingCreated();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FAF9F6] rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-stone-200 text-[#1E1B4B] max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#1E1B4B]" />
            <h3 className="text-base font-bold text-[#1E1B4B]">{t.publishModalTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-stone-200 text-stone-400 hover:text-stone-700 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8 space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h4 className="text-base font-bold text-[#1E1B4B]">{t.publishSuccessTitle}</h4>
            <p className="text-xs text-stone-500">{t.publishSuccessDesc}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <div>
              <label className="block font-bold text-stone-700 mb-1">{t.listingTitleLabel}</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder={t.listingTitlePlaceholder}
                className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-stone-700 mb-1">{t.cityLabel}</label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={e => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">{t.neighborhoodLabel}</label>
                <input
                  type="text"
                  value={formData.neighborhood}
                  onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                  placeholder={t.neighborhoodPlaceholder}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-stone-700 mb-1">{t.rentLabel}</label>
                <input
                  type="number"
                  required
                  value={formData.rent}
                  onChange={e => setFormData({ ...formData, rent: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">{t.surface} (m²)</label>
                <input
                  type="number"
                  value={formData.surface_sqm}
                  onChange={e => setFormData({ ...formData, surface_sqm: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">{t.roomsCount}</label>
                <input
                  type="number"
                  value={formData.rooms_count}
                  onChange={e => setFormData({ ...formData, rooms_count: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">{t.imageUrlLabel}</label>
              <input
                type="url"
                value={formData.image_url}
                onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">{t.descriptionLabel}</label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder={t.descriptionPlaceholder}
                className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 focus:outline-none focus:border-[#1E1B4B]"
              />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.furnished}
                  onChange={e => setFormData({ ...formData, furnished: e.target.checked })}
                  className="rounded border-stone-300 text-[#1E1B4B]"
                />
                <span className="font-semibold text-stone-700">{t.furnished}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.pets_allowed}
                  onChange={e => setFormData({ ...formData, pets_allowed: e.target.checked })}
                  className="rounded border-stone-300 text-[#1E1B4B]"
                />
                <span className="font-semibold text-stone-700">{t.petsAllowed}</span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1E1B4B] hover:bg-[#28235C] text-white rounded-xl font-bold transition-all shadow-xs disabled:opacity-50"
              >
                {loading ? t.publishingBtn : t.publishListingBtn}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
