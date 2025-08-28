import SpotifyWebApi from "spotify-web-api-node";

// Interface untuk data track
interface SpotifyTrackInfo {
  title: string;
  artist: string;
  album: string;
  duration: number;
  durationFormatted: string;
  cover: string | null;
  url: string;
  preview: string | null;
  popularity: number;
  explicit: boolean;
  releaseDate: string;
}

// Interface untuk error handling
interface SpotifyError {
  success: false;
  error: string;
  details?: any;
}

interface SpotifySuccess {
  success: true;
  data: SpotifyTrackInfo;
}

type SpotifyResult = SpotifySuccess | SpotifyError;

class SpotifyService {
  private spotifyApi: SpotifyWebApi;
  private tokenExpiry: number = 0;

  constructor() {
    this.spotifyApi = new SpotifyWebApi({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    });
  }

  // Validasi environment variables
  private validateConfig(): boolean {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.error('❌ Spotify Client ID atau Client Secret tidak ditemukan di environment variables');
      return false;
    }
    return true;
  }

  // Get atau refresh access token
  private async ensureValidToken(): Promise<boolean> {
    try {
      // Cek apakah token masih valid (dengan buffer 5 menit)
      if (Date.now() < this.tokenExpiry - 300000) {
        return true;
      }

      console.log('🔄 Mendapatkan access token baru...');
      const tokenResponse = await this.spotifyApi.clientCredentialsGrant();
      
      this.spotifyApi.setAccessToken(tokenResponse.body.access_token);
      // Set expiry time (default 1 hour)
      this.tokenExpiry = Date.now() + (tokenResponse.body.expires_in * 1000);
      
      console.log('✅ Access token berhasil didapatkan');
      return true;
    } catch (error) {
      console.error('❌ Error getting access token:', error);
      return false;
    }
  }

  // Extract track ID dari berbagai format URL Spotify
  private extractTrackId(url: string): string | null {
    const patterns = [
      /spotify:track:([a-zA-Z0-9]+)/,
      /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/,
      /spotify\.com\/track\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  // Format durasi dari ms ke mm:ss
  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Search tracks berdasarkan nama judul
  async searchTrackByName(query: string, limit: number = 5): Promise<SpotifyResult | { success: true; data: SpotifyTrackInfo[] }> {
    try {
      // Validasi config
      if (!this.validateConfig()) {
        return {
          success: false,
          error: 'Konfigurasi Spotify tidak valid'
        };
      }

      // Pastikan token valid
      const tokenValid = await this.ensureValidToken();
      if (!tokenValid) {
        return {
          success: false,
          error: 'Gagal mendapatkan access token'
        };
      }

      // Search tracks
      console.log(`🔍 Mencari lagu: "${query}"...`);
      const searchResponse = await this.spotifyApi.searchTracks(query, { limit });
      const tracks = searchResponse.body.tracks?.items || [];

      if (tracks.length === 0) {
        return {
          success: false,
          error: `Tidak ada lagu yang ditemukan dengan kata kunci: "${query}"`
        };
      }

      // Convert ke format SpotifyTrackInfo
      const results: SpotifyTrackInfo[] = tracks.map(track => ({
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        album: track.album.name,
        duration: track.duration_ms,
        durationFormatted: this.formatDuration(track.duration_ms),
        cover: track.album.images[0]?.url || null,
        url: track.external_urls.spotify,
        preview: track.preview_url,
        popularity: track.popularity,
        explicit: track.explicit,
        releaseDate: track.album.release_date,
      }));

      return {
        success: true,
        data: results
      };

    } catch (error: any) {
      console.error('❌ Error searching tracks:', error);
      return {
        success: false,
        error: 'Gagal mencari lagu di Spotify',
        details: error?.body?.error
      };
    }
  }

  // Main function untuk get track info (by URL or search by name)
  async getTrackInfo(input: string): Promise<SpotifyResult> {
    try {
      // Validasi config
      if (!this.validateConfig()) {
        return {
          success: false,
          error: 'Konfigurasi Spotify tidak valid'
        };
      }

      // Cek apakah input adalah URL atau nama lagu
      const trackId = this.extractTrackId(input);
      
      if (trackId) {
        // Jika input adalah URL, ambil track by ID
        console.log(`🎵 Mengambil info track dari URL: ${trackId}...`);
        return await this.getTrackById(trackId);
      } else {
        // Jika input bukan URL, search by name dan ambil hasil pertama
        console.log(`🔍 Mencari lagu dengan nama: "${input}"...`);
        const searchResult = await this.searchTrackByName(input, 1);
        
        if (searchResult.success && Array.isArray(searchResult.data)) {
          if (searchResult.data.length > 0) {
            return {
              success: true,
              data: searchResult.data[0]
            };
          } else {
            return {
              success: false,
              error: `Lagu "${input}" tidak ditemukan`
            };
          }
        } else {
          return searchResult as SpotifyResult;
        }
      }

    } catch (error: any) {
      console.error('❌ Error getting track info:', error);
      return {
        success: false,
        error: 'Terjadi error saat mengambil info lagu',
        details: error?.body?.error
      };
    }
  }

  // Helper method untuk get track by ID
  private async getTrackById(trackId: string): Promise<SpotifyResult> {
    try {
      // Pastikan token valid
      const tokenValid = await this.ensureValidToken();
      if (!tokenValid) {
        return {
          success: false,
          error: 'Gagal mendapatkan access token'
        };
      }

      // Get track data
      const trackResponse = await this.spotifyApi.getTrack(trackId);
      const track = trackResponse.body;

      // Build result object
      const result: SpotifyTrackInfo = {
        title: track.name,
        artist: track.artists.map(artist => artist.name).join(', '),
        album: track.album.name,
        duration: track.duration_ms,
        durationFormatted: this.formatDuration(track.duration_ms),
        cover: track.album.images[0]?.url || null,
        url: track.external_urls.spotify,
        preview: track.preview_url,
        popularity: track.popularity,
        explicit: track.explicit,
        releaseDate: track.album.release_date,
      };

      return {
        success: true,
        data: result
      };

    } catch (error: any) {
      console.error('❌ Error getting track by ID:', error);
      
      let errorMessage = 'Terjadi error tidak dikenal';
      
      if (error?.body?.error) {
        switch (error.body.error.status) {
          case 400:
            errorMessage = 'Request tidak valid';
            break;
          case 401:
            errorMessage = 'Token tidak valid atau expired';
            break;
          case 404:
            errorMessage = 'Track tidak ditemukan';
            break;
          case 429:
            errorMessage = 'Rate limit exceeded';
            break;
          default:
            errorMessage = error.body.error.message || 'Spotify API error';
        }
      }

      return {
        success: false,
        error: errorMessage,
        details: error?.body?.error
      };
    }
  }

  // Helper method untuk test multiple inputs (URLs atau nama lagu)
  async testMultipleInputs(inputs: string[]): Promise<void> {
    console.log(`🧪 Testing ${inputs.length} Spotify inputs...\n`);
    
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const isUrl = this.extractTrackId(input) !== null;
      
      console.log(`[${i + 1}/${inputs.length}] Testing ${isUrl ? 'URL' : 'Search'}: ${input}`);
      
      const result = await this.getTrackInfo(input);
      
      if (result.success) {
        console.log('✅ Success:');
        console.log(`   🎵 ${result.data.title}`);
        console.log(`   👤 ${result.data.artist}`);
        console.log(`   💽 ${result.data.album}`);
        console.log(`   ⏱️  ${result.data.durationFormatted}`);
        console.log(`   📈 Popularity: ${result.data.popularity}/100`);
        console.log(`   🔗 ${result.data.url}`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
        if (result.details) {
          console.log(`   Details:`, result.details);
        }
      }
      
      console.log(''); // Empty line for separation
    }
  }

  // Test search dengan multiple results
  async testSearch(query: string, limit: number = 5): Promise<void> {
    console.log(`🔍 Searching for: "${query}" (limit: ${limit})\n`);
    
    const result = await this.searchTrackByName(query, limit);
    
    if (result.success && Array.isArray(result.data)) {
      console.log(`✅ Found ${result.data.length} results:\n`);
      
      result.data.forEach((track, index) => {
        console.log(`[${index + 1}] 🎵 ${track.title}`);
        console.log(`    👤 ${track.artist}`);
        console.log(`    💽 ${track.album}`);
        console.log(`    ⏱️  ${track.durationFormatted} | 📈 ${track.popularity}/100`);
        console.log(`    🔗 ${track.url}`);
        console.log('');
      });
    } else {
      console.log(`❌ Search failed: ${result.error}`);
    }
  }
}

// Export default function untuk testing
export default async function testSpotify() {
  const spotifyService = new SpotifyService();
  
  // Test URLs - berbagai format
  const testUrls = [
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=abc123",
    "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    "https://spotify.com/track/0VjIjW4GlULA4LGgAw5mVU",
    "https://open.spotify.com/track/invalid-track-id", // Test error case
  ];

  try {
    // Test single URL
    console.log('='.repeat(50));
    console.log('🎧 SPOTIFY API TEST');
    console.log('='.repeat(50));
    
    const singleResult = await spotifyService.getTrackInfo(testUrls[0]);
    
    if (singleResult.success) {
      console.log('✅ Single URL Test - SUCCESS');
      console.log('Track Info:', JSON.stringify(singleResult.data, null, 2));
    } else {
      console.log('❌ Single URL Test - FAILED');
      console.log('Error:', singleResult.error);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📋 MULTIPLE URLs TEST');
    console.log('='.repeat(50));
    
    // Test multiple URLs
    await spotifyService.testMultipleInputs(testUrls);
    
    console.log('🎉 Test completed!');
    
  } catch (error) {
    console.error('💥 Fatal error during test:', error);
  }
}

// Export class untuk digunakan di tempat lain
export { SpotifyService };