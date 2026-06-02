const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

const originalFetch = window.fetch

window.fetch = function(url, options = {}) {
  const token = getCookie('auth_token')
  const expires = getCookie('auth_expires')

  if (token && expires && Date.now() < parseInt(expires)) {
    options.headers = {
      ...options.headers,
      'Authorization': token
    }
  }

  return originalFetch(url, options).then(async (response) => {
    if (response.status === 401 && url.startsWith('/api/')) {
      document.cookie = 'auth_token=; max-age=0; path=/'
      document.cookie = 'auth_expires=; max-age=0; path=/'
      window.location.href = '/login'
      return Promise.reject(new Error('未授权'))
    }
    return response
  })
}
