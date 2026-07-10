# open-twin-provider-google-health

A provider for connecting Fitbit devices and APIs to the Open Twin ecosystem. This package retrieves user and device data from Fitbit and transforms it into an open, standardized format for interoperable processing and further analysis.

# Features

t.b.d.

# Installation

t.b.d. (npm install @open-twin/provider-google-health)

# Usage

To use this connector, you need both an Access Token and a Refresh Token. You will initially use a one-time Authorization Code to generate them. Because the access token expires quickly (< 60 minutes), the connector relies on the refresh token to maintain a continuous connection. Please ensure your tokens are captured upon generation and stored in an env file accessible to the connector.

You can use the getGoogleHealthAuthUrl function to generate the authentication URL with the required scopes.

# Disclaimer

This project is an independent and unofficial integration for Fitbit services and devices. It is not affiliated with, endorsed by, sponsored by, or otherwise associated with Fitbit LLC or Google LLC.

“Fitbit” is a trademark of Google LLC. All product names, logos, and brands are property of their respective owners.

# Trademarks

Fitbit is a trademark of Google LLC.

Use of these names does not imply endorsement or affiliation.

# License

MIT
