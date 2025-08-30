# GitHub Secrets Setup for Firebase Functions Deployment

This document outlines the required GitHub secrets and environments for the Firebase Functions deployment workflow.

## Environments

The workflow supports two environments:
- **development** - Triggered by pushes to the `development` branch
- **production** - Triggered by pushes to the `main` branch

## Required GitHub Secrets

Since each environment has isolated secrets, you can use the **same secret names** in both environments. Each environment will contain its own values for these secrets:

### Secret Names (same in both environments)

- `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON for the respective project
- `DATABASE_ID` - Firestore database ID (e.g., 'development' or 'production')
- `STORAGE_BUCKET` - Firebase Storage bucket for the respective environment
- `FIREBASE_PROJECT_ID` - Firebase project ID for the respective environment
- `SENTRY_DSN` - Sentry DSN for the respective environment
- `MAILGUN_API_KEY` - Mailgun API key for the respective environment
- `MAILGUN_DOMAIN` - Mailgun domain for the respective environment

## Environment Setup in GitHub

1. Go to your repository **Settings**
2. Navigate to **Environments** in the left sidebar
3. Create two environments:
   - `development`
   - `production`
4. For each environment, add the secrets listed above with their respective values:
   - **Development environment**: Add secrets with development project values
   - **Production environment**: Add secrets with production project values

## Workflow Behavior

### Automatic Deployment
- **Development Branch**: Pushes to `development` automatically deploy using development environment secrets
- **Main Branch**: Pushes to `main` automatically deploy using production environment secrets

### Manual Deployment
- Use the "workflow_dispatch" option to manually trigger deployment
- You can choose the target environment when manually triggering
- Enable debug mode for troubleshooting if needed

## Example Setup

### Development Environment
```
FIREBASE_SERVICE_ACCOUNT: { "type": "service_account", "project_id": "myapp-dev", ... }
DATABASE_ID: development
STORAGE_BUCKET: myapp-dev.appspot.com
FIREBASE_PROJECT_ID: myapp-dev
SENTRY_DSN: https://dev-key@sentry.io/project-id
MAILGUN_API_KEY: key-dev123...
MAILGUN_DOMAIN: dev.myapp.com
```

### Production Environment
```
FIREBASE_SERVICE_ACCOUNT: { "type": "service_account", "project_id": "myapp-prod", ... }
DATABASE_ID: production
STORAGE_BUCKET: myapp-prod.appspot.com
FIREBASE_PROJECT_ID: myapp-prod
SENTRY_DSN: https://prod-key@sentry.io/project-id
MAILGUN_API_KEY: key-prod456...
MAILGUN_DOMAIN: myapp.com
```

## Firebase Service Account Setup

For each environment, you'll need to:

1. Create a service account in the respective Firebase project
2. Grant the service account the following roles:
   - Firebase Admin SDK Administrator Service Agent
   - Cloud Functions Admin
   - Storage Admin
3. Generate a JSON key for the service account
4. Add the entire JSON content as the respective `*_FIREBASE_SERVICE_ACCOUNT` secret

## Notes

- The workflow automatically sets the correct Firebase project using `firebase use` command
- Environment variables are created dynamically based on the target environment
- Tests run for all deployments to ensure code quality
- Coverage reports are generated and archived for 14 days
