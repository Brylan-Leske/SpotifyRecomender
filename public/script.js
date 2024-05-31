const clientId = 'client-id-goes-here'; // your clientId
const redirectUrl = 'http://localhost:8080';        // your redirect URL - must be localhost URL and/or HTTPS

const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const scope = 'user-read-private playlist-modify-public playlist-modify-private';

const recommendationParameters = {
    artists: [],
    tracks: [],
    genres: [],
    limit: 10
};
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

        checkTokenExpiration()

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
            const numberInput = document.getElementById('number-input').value;

            const totalItems = recommendationParameters.artists.length + recommendationParameters.tracks.length + recommendationParameters.genres.length;

            if (totalItems < 1 || totalItems > 5) {
                alert('Please provide a minimum of 1 and a maximum of 5 items across artists, tracks, and genres.');
                return;
            }

            if (!numberInput || numberInput < 1 || numberInput > 100) {
                alert('Please provide a number of recommendations between 1 and 100.');
                return;
            }

            recommendationParameters.limit = parseInt(numberInput, 10)

            processRecommendations(recommendationParameters);


        });
    }

    if (!currentToken.access_token) {
        const topbar = document.getElementById("topbar");
        topbar.style.display = "none";
        renderTemplate("main", "login");
    }


}

initialize()

function checkTokenExpiration() {
    const expires = new Date(currentToken.expires);
    const now = new Date();

    if (now >= expires) {
        logoutClick();
    }
}

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
    const { artists, tracks, genres, limit } = parameters;

    const seedArtists = artists.join(',');
    const seedTracks = tracks.join(',');
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


var availableGenres = []

async function getAvailableGenres() {
    if (availableGenres.length == 0) { // Change "availableGenres" here
        const response = await fetch("https://api.spotify.com/v1/recommendations/available-genre-seeds", {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
        });
        const data = await response.json()

        availableGenres = data.genres;
        return availableGenres;
    } else {
        return availableGenres;
    }
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

async function searchArtists(keyword) {
    const response = await fetch("https://api.spotify.com/v1/search?q=" + encodeURIComponent(keyword) + "&type=artist&limit=5", {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    const data = await response.json();

    var newTable = [];

    data.artists.items.forEach((artist) => {
        var artistTable = {}
        artistTable.id = artist.id
        artistTable.name = artist.name
        newTable.push(artistTable)
    })


    return newTable;
}

async function searchTracks(keyword) {
    const response = await fetch("https://api.spotify.com/v1/search?q=" + encodeURIComponent(keyword) + "&type=track&limit=5", {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + currentToken.access_token },
    });

    const data = await response.json();

    var newTable = [];

    data.tracks.items.forEach((track) => {
        var trackTable = {}
        trackTable.id = track.id
        trackTable.name = track.name + ' - ' + track.artists[0].name
        newTable.push(trackTable)
    })


    return newTable;
}

async function searchGenres(keyword) {
    const genres = await getAvailableGenres();
    const keywordLowerCase = keyword.toLowerCase();

    // Filter genres that exactly match the keyword
    const exactMatch = genres.find(genre => genre.toLowerCase() === keywordLowerCase);
    const filteredGenres = genres.filter(genre => genre.toLowerCase().includes(keywordLowerCase));

    // Sort filtered genres based on how closely they match the keyword
    filteredGenres.sort((a, b) => {
        const indexOfA = a.toLowerCase().indexOf(keywordLowerCase);
        const indexOfB = b.toLowerCase().indexOf(keywordLowerCase);
        return indexOfA - indexOfB;
    });

    // Include the exact match and the top 3 closest matches (excluding the exact match)
    const result = [];
    if (exactMatch) {
        result.push({
            id: exactMatch,
            name: exactMatch.toLowerCase().split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        });
    }
    const closestMatches = filteredGenres.slice(0, Math.min(3, filteredGenres.length));
    closestMatches.forEach(genre => {
        result.push({
            id: genre,
            name: genre.toLowerCase().split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        });
    });

    result.push({
        id: keyword.toLowerCase().replace(/\s/g, '-'),
        name: keyword
    })

    return result;
}



// Array to store selected items


async function addSelectedItem(type, itemId, itemName, event) {
    event.preventDefault(); // Prevent the default behavior of the link

    // Add item ID to the recommendationParameters array for the given type
    recommendationParameters[type].push(itemId);

    // Add item name as a tag
    addTagToContainer(type, itemName);

    // Clear the search bar text
    document.getElementById(`${type}-input`).value = '';

    // Hide search results
    document.getElementById(`${type}SearchResult`).style.display = "none";
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// Use debounce for searchItems function
const debouncedSearchItems = debounce(searchItems, 500); // 500 milliseconds debounce time


async function searchItems(type) {
    const input = document.getElementById(`${type}-input`);
    const filter = input.value;

    if (filter.length === 0) {
        document.getElementById(`${type}SearchResult`).style.display = "none";
        document.getElementById(`${type}-input-container`).classList.remove('input-categories-open');
        return;
    }

    let results = [];
    switch (type) {
        case 'artists':
            results = await searchArtists(filter);
            break;
        case 'tracks':
            results = await searchTracks(filter);
            break;
        case 'genres':
            results = await searchGenres(filter);
            break;
        default:
            break;
    }

    const resultContainer = document.getElementById(`${type}SearchResult`);
    resultContainer.style.width = (document.getElementById(`${type}-input-container`).offsetWidth - 20) + 'px'

    document.getElementById(`${type}-input-container`).classList.add('input-categories-open');


    resultContainer.innerHTML = ''; // Clear previous results

    results.forEach(item => {
        const itemElement = document.createElement('a');
        itemElement.className = `${type}-search-result`;
        itemElement.textContent = item.name;
        itemElement.href = ''; // Prevent default link behavior
        itemElement.dataset.id = item.id; // Store the item ID in a data attribute
        itemElement.onclick = (event) => addSelectedItem(type, item.id, item.name, event);
        resultContainer.appendChild(itemElement);
    });

    resultContainer.style.display = results.length ? "block" : "none";

    if (results.length === 0) {
        document.getElementById(`${type}-input-container`).classList.remove('input-categories-open');
    }
}

function addTagToContainer(type, itemName) {
    const container = document.getElementById(`${type}-input-container`);
    const newTag = document.createElement('li');
    newTag.innerHTML = itemName;
    // Add click event listener to remove the tag when clicked
    newTag.addEventListener('click', function () {
        // Remove item ID from the recommendationParameters array for the given type
        const itemId = this.dataset.id;
        const index = recommendationParameters[type].indexOf(itemId);
        if (index > -1) {
            recommendationParameters[type].splice(index, 1);
        }
        // Remove the tag from the container
        this.parentNode.removeChild(this);
    });
    container.querySelector('ul').appendChild(newTag);
}
