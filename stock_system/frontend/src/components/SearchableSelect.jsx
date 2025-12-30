import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'ค้นหา...',
  getLabel = (opt) => opt.name || opt.label,
  getId = (opt) => opt._id || opt.value,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const filteredOptions = options.filter((opt) => {
    const label = String(getLabel(opt) || '').toLowerCase();
    const id = String(getId(opt) || '').toLowerCase();
    return label.includes(searchTerm.toLowerCase()) || id.includes(searchTerm.toLowerCase());
  });

  const selectedOption = options.find((opt) => getId(opt) === value);

  const handleSelect = (opt) => {
    onChange(getId(opt));
    setSearchTerm('');
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        placeholder={placeholder}
        value={isOpen ? searchTerm : selectedOption ? getLabel(selectedOption) : ''}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setSearchTerm('');
        }}
      />
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg max-h-52 overflow-y-auto z-50 shadow-lg">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={getId(opt)}
                onClick={() => handleSelect(opt)}
                className={`px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                  getId(opt) === value ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-sm text-gray-700">{getLabel(opt)}</span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400 text-center">ไม่พบรายการ</div>
          )}
        </div>
      )}
    </div>
  );
}
