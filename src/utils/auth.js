const originalFetch = window.fetch

window.fetch = function(url, options = {}) {
  const token = localStorage.getItem('auth_token')
  const expires = localStorage.getItem('auth_expires')

  if (token && expires && Date.now() < parseInt(expires)) {
    options.headers = {
      ...options.headers,
      'Authorization': token
    }
  }

  return originalFetch(url, options).then(async (response) => {
    if (response.status === 401 && url.startsWith('/api/')) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_expires')
      window.location.href = '/login'
      return Promise.reject(new Error('未授权'))
    }
    return response
  })
}
