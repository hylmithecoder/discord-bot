import fs from "fs"

interface ToxicRecord {
    userId: string;
    username: string;
    violations: number;
    lastViolation: string;
    wordsUsed: string[];
}

export class BanWord {
    private banwordPath: string;
    private banwords: string[];
    private toxicUsersPath: string;
    private toxicUsers: Map<string, ToxicRecord>;

    constructor(banwordPath: string = "banword.txt") {
        this.banwordPath = banwordPath;
        this.banwords = [];
        this.toxicUsersPath = "toxic_users.json";
        this.toxicUsers = new Map();
    }

    async init() {
        if (this.banwords.length > 0) return;

        try {
            const data = await fs.promises.readFile(this.banwordPath, "utf-8");
            this.banwords = data.split("\n").map(word => word.trim()).filter(word => word.length > 0);
            console.log(`📦 Banword database initialized. ${this.banwords.length} banwords loaded.`);
        } catch (error) {
            console.error("❌ Failed to initialize banword database:", error);
        }

        // Load toxic users
        try {
            const toxicData = await fs.promises.readFile(this.toxicUsersPath, "utf-8");
            const parsed = JSON.parse(toxicData) as ToxicRecord[];
            for (const record of parsed) {
                this.toxicUsers.set(record.userId, record);
            }
            console.log(`🚨 Toxic users database loaded. ${this.toxicUsers.size} users tracked.`);
        } catch {
            // File belum ada, no problem
        }
    }

    // Cek apakah pesan mengandung banword (case-insensitive)
    checkMessage(message: string): boolean {
        const lowerMessage = message.toLowerCase();
        return this.banwords.some(word => lowerMessage.includes(word.toLowerCase()));
    }

    // Dapatkan banword yang ditemukan di pesan
    getFoundBanwords(message: string): string[] {
        const lowerMessage = message.toLowerCase();
        return this.banwords.filter(word => lowerMessage.includes(word.toLowerCase()));
    }

    // Sensor pesan: ganti banword dengan ***
    censorMessage(message: string): string {
        let censored = message;
        for (const word of this.banwords) {
            const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            censored = censored.replace(regex, '***');
        }
        return censored;
    }

    // ========== TOXIC USER TRACKING ==========

    async recordViolation(userId: string, username: string, wordsFound: string[]) {
        const existing = this.toxicUsers.get(userId);
        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        if (existing) {
            existing.violations += 1;
            existing.lastViolation = now;
            existing.username = username;
            // Tambah kata baru yang belum ada
            for (const w of wordsFound) {
                if (!existing.wordsUsed.includes(w)) {
                    existing.wordsUsed.push(w);
                }
            }
        } else {
            this.toxicUsers.set(userId, {
                userId,
                username,
                violations: 1,
                lastViolation: now,
                wordsUsed: wordsFound,
            });
        }

        await this.saveToxicUsers();
        const record = this.toxicUsers.get(userId)!;
        console.log(`🚨 Violation recorded: ${username} (${userId}) - ${record.violations} total violations`);
        return record;
    }

    getToxicUsers(): ToxicRecord[] {
        return Array.from(this.toxicUsers.values())
            .sort((a, b) => b.violations - a.violations);
    }

    getUserViolations(userId: string): ToxicRecord | null {
        return this.toxicUsers.get(userId) || null;
    }

    private async saveToxicUsers() {
        const data = Array.from(this.toxicUsers.values());
        await fs.promises.writeFile(this.toxicUsersPath, JSON.stringify(data, null, 2));
    }

    // ========== BANWORD CRUD ==========

    async addBanword(word: string) {
        const lower = word.toLowerCase().trim();
        if (!lower) return;
        if (!this.banwords.includes(lower)) {
            this.banwords.push(lower);
            await this.saveBanwords();
            console.log(`✅ Banword added: ${lower}`);
        }
    }

    async removeBanword(word: string) {
        const lower = word.toLowerCase().trim();
        const index = this.banwords.indexOf(lower);
        if (index > -1) {
            this.banwords.splice(index, 1);
            await this.saveBanwords();
            console.log(`✅ Banword removed: ${lower}`);
        }
    }

    async getBanwords() {
        return this.banwords;
    }

    async saveBanwords() {
        await fs.promises.writeFile(this.banwordPath, this.banwords.join("\n"));
    }
}