const clientId = 'ae92d6a5af594310b5a621552b4410ce'; // your clientId
const redirectUrl = 'http://localhost:8080';        // your redirect URL - must be localhost URL and/or HTTPS

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope = 'user-read-private playlist-modify-public playlist-modify-private';

var recentlyRecommended = {};
var gottenUserData = {};

// Data structure that manages the current active token, caching it in localStorage
const currentToken = {
    get access_token() { return localStorage.getItem('access_token') || null; },
    get refresh_token() { return localStorage.getItem('refresh_token') || null; },
    get expires_in() { return localStorage.getItem('refresh_in') || null },
    get expires() { return localStorage.getItem('expires') || null },

    save: function (response) {
        const { access_token, refresh_token, expires_in } = response;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        localStorage.setItem('expires_in', expires_in);

        const now = new Date();
        const expiry = new Date(now.getTime() + (expires_in * 1000));
        localStorage.setItem('expires', expiry);
    }
};

// On page load, try to fetch auth code from current browser search URL
const args = new URLSearchParams(window.location.search);
const code = args.get('code');

async function initialize() {
    if (code) {
        const token = await getToken(code);
        currentToken.save(token);

        const url = new URL(window.location.href);
        url.searchParams.delete("code");

        const updatedUrl = url.search ? url.href : url.href.replace('?', '');
        window.history.replaceState({}, document.title, updatedUrl);
    }

    if (currentToken.access_token) {
        const userData = await getUserData();
        gottenUserData = userData
        renderTemplate("main", "logged-in-template", userData);
        // renderTemplate("oauth", "oauth-template", currentToken);

        const profileImage = document.getElementById("profile-picture");
        profileImage.src = userData.images[1].url

        const profileName = document.getElementById("profile-name");
        profileName.innerHTML = userData.display_name;

        const topbar = document.getElementById("topbar");
        topbar.style.display = "flex";

        document.getElementById('create-playlist-button').addEventListener('click', function () {
            const artistInput = document.getElementById('artist-input').value.split(',').map(item => item.trim()).filter(Boolean);
            const songInput = document.getElementById('song-input').value.split(',').map(item => item.trim()).filter(Boolean);
            const genreInput = document.getElementById('genre-input').value.split(',').map(item => item.trim()).filter(Boolean);
            const numberInput = document.getElementById('number-input').value;

            const totalItems = artistInput.length + songInput.length + genreInput.length;

            if (totalItems < 1 || totalItems > 5) {
                alert('Please provide a total of 1 to 5 items across artists, songs, and genres.');
                return;
            }

            if (!numberInput || numberInput < 1 || numberInput > 100) {
                alert('Please provide a number of recommendations between 1 and 100.');
                return;
            }

            const table = {
                artists: artistInput,
                songs: songInput,
                genres: genreInput,
                limit: parseInt(numberInput, 10)
            };

            processRecommendations(table);


        });
    }

    if (!currentToken.access_token) {
        const topbar = document.getElementById("topbar");
        topbar.style.display = "none";
        renderTemplate("main", "login");
    }


}

initialize()

async function redirectToSpotifyAuthorize() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = crypto.getRandomValues(new Uint8Array(64));
    const randomString = randomValues.reduce((acc, x) => acc + possible[x % possible.length], "");

    const code_verifier = randomString;
    const data = new TextEncoder().encode(code_verifier);
    const hashed = await crypto.subtle.digest('SHA-256', data);

    const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    window.localStorage.setItem('code_verifier', code_verifier);

    const authUrl = new URL(authorizationEndpoint)
    const params = {
        response_type: 'code',
        client_id: clientId,
        scope: scope,
        code_challenge_method: 'S256',
        code_challenge: code_challenge_base64,
        redirect_uri: redirectUrl,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString(); // Redirect the user to the authorization server for login
}

// Soptify API Calls
async function getToken(code) {
    const code_verifier = localStorage.getItem('code_verifier');

    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUrl,
            code_verifier: code_verifier,
        }),
    });

    return await response.json();
}

async function refreshToken() {
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: currentToken.refresh_token
        }),
    });

    return await response.json();
}

async function getUserData() {
    const response = await fetch("https://api.spotify.com/v1/me", {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    return await response.json();
}

async function processRecommendations(parameters) {
    const recommendations = await getRecommendations(parameters);
    recentlyRecommended = recommendations;
    if (!recommendations || !recommendations.tracks) {
        console.error('Invalid recommendations data:', recommendations);
        return;
    }

    const tableBody = document.querySelector("#playlist-table tbody");
    tableBody.innerHTML = ""; // Clear existing rows

    recommendations.tracks.forEach((track, index) => {
        const row = document.createElement("tr");

        const indexCell = document.createElement("td");
        indexCell.className = 'no-padding-table';
        indexCell.textContent = index + 1;
        row.appendChild(indexCell);

        const albumArtCell = document.createElement("td");
        albumArtCell.className = 'album-art-column';
        const albumArtImage = document.createElement("img");
        albumArtImage.src = track.album.images[0]?.url || 'Portrait_Placeholder.png';
        albumArtImage.className = 'album-art-column-image';
        albumArtImage.id = `album-art-${index + 1}`;
        albumArtCell.appendChild(albumArtImage);
        row.appendChild(albumArtCell);

        const trackCell = document.createElement("td");
        const trackLink = document.createElement("a");
        trackLink.href = track.external_urls.spotify;
        trackLink.textContent = track.name;
        trackLink.className = 'track-title-link';
        trackLink.target = "_blank"; // Open link in a new tab
        trackCell.appendChild(trackLink);
        row.appendChild(trackCell);

        const artistCell = document.createElement("td");
        artistCell.className = 'artist-name';
        artistCell.textContent = track.artists.map(artist => artist.name).join(', ');
        row.appendChild(artistCell);

        const appButtonCell = document.createElement("td");
        appButtonCell.className = 'spotify-app-button-cell';

        appButtonButton = document.createElement("a")
        appButtonButton.href = 'spotify://' + track.type + '/' + track.id
        appButtonButton.target = '_blank'

        const appButton = document.createElement("img");
        appButton.className = 'spotify-app-button';
        appButton.title = 'Open this track in Spotify';
        appButton.src = 'spotify_icon_black.png';

        appButtonButton.appendChild(appButton);
        appButtonCell.appendChild(appButtonButton);
        row.appendChild(appButtonCell)

        row.appendChild(artistCell);

        tableBody.appendChild(row);
    });

    const createdPlaylistDiv = document.getElementById("created-playlist")
    createdPlaylistDiv.style.display = "block";
}

async function getRecommendations(parameters) {
    const { artists, songs, genres, limit } = parameters;

    const seedArtists = artists.join(',');
    const seedTracks = songs.join(',');
    const seedGenres = genres.join(',');

    const url = new URL('https://api.spotify.com/v1/recommendations');
    const params = {
        limit: limit,
        seed_artists: seedArtists,
        seed_tracks: seedTracks,
        seed_genres: seedGenres
    };

    Object.keys(params).forEach(key => {
        if (params[key]) {
            url.searchParams.append(key, params[key]);
        }
    });

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    const data = await response.json();


    if (!data || !data.tracks) {
        throw new Error('Failed to fetch recommendations');
    }

    return data;
}

async function createPlaylist() {
    const nameString = "New Playlist";
    const descriptionString = toString("Playlist created by Spotify Recommendation Engine. Created on " + toString(Date.now.toString));

    const response = await fetch("https://api.spotify.com/v1/users/" + gottenUserData.id + "/playlists", {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + currentToken.access_token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
            {
                "name": nameString,
                "description": descriptionString,
                "public": false
            }
        )
    });

    return await response.json();
}

async function addItemsToPlaylist(playlist_id, uris) {
    const response = await fetch("https://api.spotify.com/v1/playlists/" + playlist_id + "/tracks", {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + currentToken.access_token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(
            {
                "uris": uris
            }
        )
    });

    return await response.json();
}

async function addPlaylistToLibrary() {
    if (recentlyRecommended) {
        const uris = recentlyRecommended.tracks.map(track => track.uri);
        const createdPlaylist = await createPlaylist();
        const response = await addItemsToPlaylist(createdPlaylist.id, uris)

        window.location.href = 'spotify://playlist/' + createdPlaylist.id;
    }
}

// Click handlers
async function loginWithSpotifyClick() {
    await redirectToSpotifyAuthorize();
}

async function logoutClick() {
    localStorage.clear();
    window.location.href = redirectUrl;
}

async function refreshTokenClick() {
    const token = await refreshToken();
    currentToken.save(token);
    // renderTemplate("oauth", "oauth-template", currentToken);
}

// HTML Template Rendering with basic data binding - demoware only.
function renderTemplate(targetId, templateId, data = null) {
    const template = document.getElementById(templateId);
    const clone = template.content.cloneNode(true);

    const elements = clone.querySelectorAll("*");
    elements.forEach(ele => {
        const bindingAttrs = [...ele.attributes].filter(a => a.name.startsWith("data-bind"));

        bindingAttrs.forEach(attr => {
            const target = attr.name.replace(/data-bind-/, "").replace(/data-bind/, "");
            const targetType = target.startsWith("onclick") ? "HANDLER" : "PROPERTY";
            const targetProp = target === "" ? "innerHTML" : target;

            const prefix = targetType === "PROPERTY" ? "data." : "";
            const expression = prefix + attr.value.replace(/;\n\r\n/g, "");

            // Maybe use a framework with more validation here ;)
            try {
                ele[targetProp] = targetType === "PROPERTY" ? eval(expression) : () => { eval(expression) };
                ele.removeAttribute(attr.name);
            } catch (ex) {
                console.error(`Error binding ${expression} to ${targetProp}`, ex);
            }
        });
    });

    const target = document.getElementById(targetId);
    target.innerHTML = "";
    target.appendChild(clone);
}