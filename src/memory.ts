import { open, Database } from "sqlite"
import sqlite3 from "sqlite3"

export interface MessageMemory {
    id: number;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

export class Memory {
    private db?: Database;
    private dbPath: string;

    constructor(dbPath: string = "memory.db") {
        this.dbPath = dbPath;
    }

    async init() {
        if (this.db) return;

        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT,
                content TEXT,
                timestamp INTEGER
            )
        `);
        console.log("📦 Memory database initialized.");
    }

    async addMemory(role: "user" | "assistant", content: string) {
        if (!this.db) await this.init();
        await this.db!.run(
            "INSERT INTO memory (role, content, timestamp) VALUES (?, ?, ?)",
            [role, content, Date.now()]
        );
    }

    async getRelevantMemories(query: string, limit: number = 5): Promise<MessageMemory[]> {
        if (!this.db) await this.init();
        
        // Simple keyword-based search for now
        // We can improve this with full-text search or embeddings later
        const keywords = query.split(/\s+/).filter(k => k.length > 2);
        
        if (keywords.length === 0) {
            return await this.getRecentMemories(limit);
        }

        const placeholders = keywords.map(() => "content LIKE ?").join(" OR ");
        const params = keywords.map(k => `%${k}%`);

        const rows = await this.db!.all<MessageMemory[]>(
            `SELECT * FROM memory WHERE ${placeholders} ORDER BY timestamp DESC LIMIT ?`,
            [...params, limit]
        );
        
        return rows;
    }

    async getRecentMemories(limit: number = 10): Promise<MessageMemory[]> {
        if (!this.db) await this.init();
        return await this.db!.all<MessageMemory[]>(
            "SELECT * FROM memory ORDER BY timestamp DESC LIMIT ?",
            [limit]
        );
    }

    async clearMemory() {
        if (!this.db) await this.init();
        await this.db!.run("DELETE FROM memory");
    }
}