import OSS from 'ali-oss'

const isProduction = process.env.NODE_ENV === 'production'

export const ossConfig = {
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  publicEndpoint: process.env.OSS_PUBLIC_ENDPOINT,
  dataDir: process.env.OSS_DATA_DIR || 'data'
}

const client = new OSS({
  region: ossConfig.region,
  accessKeyId: ossConfig.accessKeyId,
  accessKeySecret: ossConfig.accessKeySecret,
  bucket: ossConfig.bucket,
  endpoint: isProduction 
    ? process.env.OSS_ENDPOINT
    : process.env.OSS_PUBLIC_ENDPOINT
})

export default client
