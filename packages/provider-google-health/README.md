# open-twin-provider-google-health

A provider for connecting Fitbit devices and APIs to the Open Twin ecosystem. This package retrieves user and device data from Fitbit and transforms it into an open, standardized format for interoperable processing and further analysis.

# Features

t.b.d.

# Installation

t.b.d. (npm install @open-twin/provider-google-health)

# Usage

To use this connector, you must provide both an Access Token and a Refresh Token.
To obtain these tokens:

 1. Redirect the user to the OAuth authorization page, where they will review the requested scopes and authorize your application.
 2. Handle the redirect: Once authorized, the user is redirected to your specified Redirect URI along with an Authorization Code.
 3. Exchange the code: Pass this authorization code to initializeGoogleHealthClient to exchange it for the tokens.

Important: This package only maintains the access and refresh tokens in memory at runtime. You must capture the generated tokens immediately and store them in a secure, persistent location.

You can use the getGoogleHealthAuthUrl function to generate the authentication URL with the required scopes.

Example usage:

```ts
const client = new GoogleHealthClient({
    clientId: 'YOUR_CLIENT_ID',
    clientSecret: 'YOUR_CLIENT_SECRET',
    redirectUri: 'YOUR_REDIRECT_URI',
});

// generate the Authorization URL
// const url = getGoogleHealthAuthUrl(client);
// After user completes the Authorization process they will be redirected to the specified URI above.
// P.S.: The URI must be added to Authorized redirect URIs in the Google Cloud Console
// For more information: https://developers.google.com/health/setup

// Exchange the Auth token for access and refresh tokens
await initializeGoogleHealthClient(client, code); // Returns Auth.Credentials

// Get the raw google health data by specifying the types, start_date, end_date
await getDataTypes({ client, types, start_date, end_date }); // Returns health_v4.Schema$ListDataPointsResponse[]

// Get the FHIR R4 parsed bundle by specifying the types, start_date, end_date
await getFhirBundleFromGoogleHealthData({ client, types, start_date, end_date }) // Returns Bundle

```

This package does not

# Disclaimer

This project is an independent and unofficial integration for Fitbit services and devices. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with Fitbit LLC or Google LLC.

“Fitbit” is a trademark of Google LLC. All product names, logos, and brands are property of their respective owners.

# Trademarks

Fitbit is a trademark of Google LLC.

Use of these names does not imply endorsement or affiliation.

# License

MIT
