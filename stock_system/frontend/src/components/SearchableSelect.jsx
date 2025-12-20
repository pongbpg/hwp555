import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ 
  options, 
  value, 
  onChange, 
  placeholder = 'ค้นหา...',
  getLabel = (opt) => opt.name,
  getId = (opt) => opt._id
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Filter options based on search term
  const filteredOptions = options.filter((opt) => {
    const label = getLabel(opt);
    const id = getId(opt);
    return (
      label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Get the selected option
  const selectedOption = options.find((opt) => getId(opt) === value);

  // Handle selection
  const handleSelect = (opt) => {
    onChange(getId(opt));
    setSearchTerm('');
    setIsOpen(false);
  };

  // Handle click outside
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
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className="input"
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
        style={{ width: '100%' }}
      />
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1000,
            marginTop: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <div
                key={getId(opt)}
                onClick={() => handleSelect(opt)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  backgroundColor: getId(opt) === value ? '#e3f2fd' : 'white',
                  borderBottom: '1px solid #f0f0f0',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = getId(opt) === value ? '#e3f2fd' : '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = getId(opt) === value ? '#e3f2fd' : 'white';
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {getLabel(opt)}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '0.875rem' }}>
              ไม่มีผลลัพธ์
            </div>
          )}
        </div>
      )}
    </div>
  );
}
