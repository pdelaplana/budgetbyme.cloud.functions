import './config/firebase'; // Ensure Firebase is initialized before importing functions
import './config/sentry'; // Initialize Sentry for error tracking

export { healthcheck } from './functions/healthCheck'; // Export the healthcheck function
export { processJob } from './functions/processJob'; // Export the processJob function
export { queueJob } from './functions/queueJob'; // Export the queueJob function
