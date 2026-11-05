# SpotifyRecomender
A web app that makes getting specific Spotify recommendations, based on artists, genres, and albums, easier than ever! I built this after the create similar playlist feature was removed.


# Usage
To start, set `clientId` in `public/script.js` to the Client ID from your Spotify Developer Dashboard. The redirect URI is derived from the URL serving the app, so register both your local URL (for example, `http://localhost:8080/`) and your deployed URL in the dashboard.

Next, using NPM you can start the web app and go to it.

Once on the site, click log in with Spotify and you're ready. The login requests private profile, playlist modification, and playback-control scopes. Playback controls require Spotify Premium and an active Spotify device.

You can enter up to five parameters in any combination of tracks, artists, and genres. Limit sets how many recommendations to generate, and can be anywhere from 1 to 100. Enter the IDs of each parameter, which can be obtained by holding Control or Option while clicking Share on Spotify, or by copying the ID from the URL.

Click Create Playlist to generate recommendations, then press Add to Spotify library to save the playlist. When music is playing on an active Spotify device, the floating player shows the current track and provides playback controls.

