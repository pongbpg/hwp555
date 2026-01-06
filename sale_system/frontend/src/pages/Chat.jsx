export default function Chat() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Facebook Chat</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden h-[600px] flex flex-col">
        <div className="flex-1 overflow-auto p-6">
          <div className="text-center text-gray-500">
            <p className="mb-4">💬 Facebook Messenger integration</p>
            <p className="text-sm">
              This feature will display messages from your Facebook page.<br/>
              Ensure Facebook webhook is properly configured.
            </p>
          </div>
        </div>
        
        <div className="border-t border-gray-200 p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Type a message..."
              className="input flex-1"
              disabled
            />
            <button className="btn btn-primary" disabled>Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}
