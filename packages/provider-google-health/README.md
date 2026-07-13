# Open Twin Google Health Provider

A provider for connecting Google Health APIs and Google/Fitbit devices to the Open Twin ecosystem. This package retrieves user and device data from Google Health API and transforms it into an open, standardized format for interoperable processing and further analysis.

## Features

* **Token Exchange:** Fetches the `access_token` using an initial user authorization code.
* **Token Refresh:** Automatically refreshes the `access_token` using a `refresh_token`.
* **Data Retrieval:** Fetches granular Google Health and device data for a specific user.
* **FHIR Standardization:** Converts raw Google Health data formats into the HL7 FHIR standard for medical/health interoperability.

> **Note:** This package does not handle the initial OAuth2 user authentication where permissions are explicitly granted in the providers website. That must be managed by your client application.

## Installation

t.b.d. (npm install @open-twin/provider-google-health)

## Usage

To use this connector, you must provide both an Access Token and a Refresh Token.
To obtain these tokens:

 1. Redirect the user to the OAuth authorization page, where they will review the requested scopes and authorize your application.
 2. Handle the redirect: Once authorized, the user is redirected to your specified Redirect URI along with an Authorization Code.
 3. Exchange the code: Pass this authorization code to initializeGoogleHealthClient to exchange it for the tokens.

⚠️ Important: This package only maintains the access and refresh tokens in memory at runtime. You must capture the generated tokens and store them in a secure, persistent location.

You can use the getGoogleHealthAuthUrl function to generate the authentication URL with the required scopes.

Example usage:

```ts
import { 
    GoogleHealthClient, 
    getGoogleHealthAuthUrl, 
    initializeGoogleHealthClient, 
    getDataTypes, 
    getFhirBundleFromGoogleHealthData 
} from '@open-twin/provider-google-health';

const client = new GoogleHealthClient({
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
    redirectUri: 'YOUR_REDIRECT_URI', // Must be listed in your Google Cloud Console. For more information: https://developers.google.com/health/setup
});

// 1. Generate the Authorization URL
const url = getGoogleHealthAuthUrl(client);

// 2. Exchange the Authorization Code for tokens
// (Run this after the user completes the flow and redirects back to your URI)
const credentials = await initializeGoogleHealthClient(client, code); 

// 3. Get raw Google Health data
const rawData = await getDataTypes({ client, types, start_date, end_date });
// The response is in the type of health_v4.Schema$ListDataPointsResponse[]
// Which is a type that comes from Google Health Node js package
// For more information: https://github.com/googleapis/google-api-nodejs-client

// 4. Get the data parsed into a FHIR R4 bundle
const fhirBundle = await getFhirBundleFromGoogleHealthData({ client, types, start_date, end_date });

```

## Disclaimer

This project is an independent, community-driven, and unofficial integration for Google Health services. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with Fitbit LLC, Google LLC, or Alphabet Inc.

## Trademarks

• "Fitbit" and "Google" are trademarks of Google LLC.
• All product names, logos, and brands are the property of their respective owners.
• The use of these names, trademarks, and brands does not imply endorsement, sponsorship, or affiliation.

## License

MIT
