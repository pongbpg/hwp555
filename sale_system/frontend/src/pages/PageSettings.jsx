import { useState, useEffect } from 'react';
import api from '../api.js';

export default function PageSettings() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  // Connected pages (ระบบ)
  const [connectedPages, setConnectedPages] = useState([]);
  
  // Facebook pages (ดึงจาก Facebook)
  const [facebookPages, setFacebookPages] = useState([]);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [isFbConnected, setIsFbConnected] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [selectedPages, setSelectedPages] = useState(new Set());

  // Fetch connected pages on mount
  useEffect(() => {
    fetchConnectedPages();
    checkFacebookConnection();
  }, []);

  const checkFacebookConnection = async () => {
    try {
      const response = await api.get('/facebook/pages');
      setFacebookPages(response.data.pages);
      setIsFbConnected(true);
    } catch (error) {
      setIsFbConnected(false);
      setFacebookPages([]);
    }
  };

  const fetchConnectedPages = async () => {
    setLoading(true);
    try {
      const response = await api.get('/pages');
      setConnectedPages(response.data);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    try {
      setLoading(true);
      const response = await api.get('/facebook/auth-url');
      // Redirect to Facebook
      window.location.href = response.data.url;
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
      setLoading(false);
    }
  };

  const handleSelectPage = (pageId) => {
    const newSelected = new Set(selectedPages);
    if (newSelected.has(pageId)) {
      newSelected.delete(pageId);
    } else {
      newSelected.add(pageId);
    }
    setSelectedPages(newSelected);
  };

  const handleConnectPages = async () => {
    if (selectedPages.size === 0) {
      setMessage({ type: 'error', text: 'Please select at least one page' });
      return;
    }

    setLoading(true);
    try {
      let successCount = 0;
      for (const pageId of selectedPages) {
        try {
          await api.post('/facebook/connect-page', { pageId });
          successCount++;
        } catch (err) {
          console.error(`Failed to connect page ${pageId}:`, err);
        }
      }
      
      setMessage({ 
        type: 'success', 
        text: `Successfully connected ${successCount} page(s)` 
      });
      setSelectedPages(new Set());
      await fetchConnectedPages();
      await checkFacebookConnection();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectFacebook = async () => {
    if (!window.confirm('Disconnect Facebook? You can reconnect later.')) return;
    
    setLoading(true);
    try {
      await api.post('/facebook/disconnect');
      setMessage({ type: 'success', text: 'Facebook disconnected' });
      setIsFbConnected(false);
      setFacebookPages([]);
      setSelectedPages(new Set());
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (pageId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await api.patch(`/pages/${pageId}`, { status: newStatus });
      setMessage({ type: 'success', text: 'Page status updated' });
      await fetchConnectedPages();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    }
  };

  const handleDeletePage = async (pageId) => {
    if (!window.confirm('Delete this page?')) return;

    try {
      await api.delete(`/pages/${pageId}`);
      setMessage({ type: 'success', text: 'Page deleted' });
      await fetchConnectedPages();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Facebook Pages</h1>
        {isFbConnected && (
          <button
            onClick={handleDisconnectFacebook}
            disabled={loading}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400"
          >
            Disconnect Facebook
          </button>
        )}
      </div>

      {/* Messages */}
      {message.text && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Facebook Login Section */}
      {!isFbConnected ? (
        <div className="bg-blue-50 rounded-lg shadow p-6 border-2 border-blue-200">
          <h2 className="text-2xl font-bold text-blue-900 mb-4">Step 1: Connect Facebook</h2>
          <p className="text-blue-800 mb-6">
            Click the button below to login with your Facebook account. You'll grant permission for the app to access your pages.
          </p>
          <button
            onClick={handleFacebookLogin}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-bold flex items-center gap-2"
          >
            <span>f</span>
            {loading ? 'Connecting...' : 'Login with Facebook'}
          </button>
        </div>
      ) : (
        <>
          {/* Available Pages Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Step 2: Select Pages</h2>
            <p className="text-gray-600 mb-4">
              Select the Facebook pages you want to connect to this system:
            </p>

            {facebookPages.length === 0 ? (
              <p className="text-gray-500 italic">No pages available</p>
            ) : (
              <div className="space-y-3 mb-6">
                {facebookPages.map((page) => (
                  <div
                    key={page.pageId}
                    className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      id={`page-${page.pageId}`}
                      checked={selectedPages.has(page.pageId)}
                      onChange={() => handleSelectPage(page.pageId)}
                      className="w-5 h-5 text-blue-600"
                    />
                    <label htmlFor={`page-${page.pageId}`} className="ml-3 flex-1 cursor-pointer">
                      <div className="flex items-center gap-3">
                        {page.picture && (
                          <img src={page.picture} alt={page.pageName} className="w-10 h-10 rounded-full" />
                        )}
                        <div>
                          <p className="font-bold text-gray-900">{page.pageName}</p>
                          <p className="text-xs text-gray-500">ID: {page.pageId}</p>
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            )}

            {selectedPages.size > 0 && (
              <button
                onClick={handleConnectPages}
                disabled={loading}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-bold"
              >
                {loading ? `Connecting ${selectedPages.size} page(s)...` : `Connect ${selectedPages.size} page(s)`}
              </button>
            )}
          </div>
        </>
      )}

      {/* Connected Pages Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">
            Connected Pages ({connectedPages.length})
          </h2>
        </div>

        {loading && connectedPages.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : connectedPages.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            {isFbConnected ? 'Select and connect pages from above' : 'No pages connected yet'}
          </div>
        ) : (
          <div className="divide-y">
            {connectedPages.map((page) => (
              <div key={page._id} className="p-6 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{page.pageName}</h3>
                  <p className="text-sm text-gray-600">ID: {page.pageId}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Messages: {page.conversationCount} | Unread: {page.unreadCount}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      page.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {page.status}
                  </span>

                  <button
                    onClick={() => handleToggleStatus(page._id, page.status)}
                    className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                  >
                    {page.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>

                  <button
                    onClick={() => handleDeletePage(page._id)}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <h3 className="font-bold text-blue-900 mb-4">How it Works</h3>
        <ol className="space-y-3 text-sm text-blue-800">
          <li>
            <strong>1. Login with Facebook:</strong> Click "Login with Facebook" and approve access for your pages
          </li>
          <li>
            <strong>2. Select Pages:</strong> Check the pages you want to connect to this chat system
          </li>
          <li>
            <strong>3. Connect:</strong> Click "Connect Pages" to sync them
          </li>
          <li>
            <strong>4. Start Chatting:</strong> Go to Chat page and start receiving customer messages
          </li>
        </ol>
      </div>
    </div>
  );
}
