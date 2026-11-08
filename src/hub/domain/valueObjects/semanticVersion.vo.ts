import { InvalidSemanticVersionError } from '../errors/hub.errors';

/**
 * Value Object imutável representando uma versão semântica de serviço (SemVer).
 * Suporta formatos canônicos como `0.10.56`, `1.0.0`, com ou sem prefixo `v`,
 * bem como sufixos de pré-lançamento (`-beta.1`, etc.).
 */
export class SemanticVersion {
    // Regex flexível e segura para SemVer com suporte a 'v' opcional e patch opcional
    private static readonly SEMVER_REGEX = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

    private readonly _major: number;
    private readonly _minor: number;
    private readonly _patch: number;
    private readonly _prerelease?: string;
    private readonly _raw: string;

    private constructor(raw: string, major: number, minor: number, patch: number, prerelease?: string) {
        this._raw = raw;
        this._major = major;
        this._minor = minor;
        this._patch = patch;
        this._prerelease = prerelease;
        Object.freeze(this);
    }

    /**
     * Cria e valida uma instância de SemanticVersion a partir de uma string.
     */
    public static create(version: string): SemanticVersion {
        if (!version || typeof version !== 'string') {
            throw new InvalidSemanticVersionError(String(version));
        }

        const trimmed = version.trim();
        const match = this.SEMVER_REGEX.exec(trimmed);

        if (!match) {
            throw new InvalidSemanticVersionError(version);
        }

        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        const patch = match[3] !== undefined ? parseInt(match[3], 10) : 0;
        const prerelease = match[4];

        return new SemanticVersion(trimmed, major, minor, patch, prerelease);
    }

    public static isValid(version: string): boolean {
        if (!version || typeof version !== 'string') return false;
        return this.SEMVER_REGEX.test(version.trim());
    }

    public get major(): number {
        return this._major;
    }

    public get minor(): number {
        return this._minor;
    }

    public get patch(): number {
        return this._patch;
    }

    public get prerelease(): string | undefined {
        return this._prerelease;
    }

    public get raw(): string {
        return this._raw;
    }

    /**
     * Retorna a versão formatada canonicamente no padrão `major.minor.patch[-prerelease]`
     */
    public toNormalizedString(): string {
        const base = `${this._major}.${this._minor}.${this._patch}`;
        return this._prerelease ? `${base}-${this._prerelease}` : base;
    }

    /**
     * Verifica igualdade estrita de versão.
     */
    public equals(other: SemanticVersion | null | undefined): boolean {
        if (!other) return false;
        return (
            this._major === other.major &&
            this._minor === other.minor &&
            this._patch === other.patch &&
            this._prerelease === other.prerelease
        );
    }

    /**
     * Verifica se esta versão é estritamente maior que outra versão.
     */
    public isGreaterThan(other: SemanticVersion): boolean {
        if (this._major !== other.major) return this._major > other.major;
        if (this._minor !== other.minor) return this._minor > other.minor;
        if (this._patch !== other.patch) return this._patch > other.patch;
        
        // Versão sem pré-lançamento tem precedência sobre com pré-lançamento
        if (!this._prerelease && other.prerelease) return true;
        if (this._prerelease && !other.prerelease) return false;
        if (this._prerelease && other.prerelease) {
            return this._prerelease.localeCompare(other.prerelease) > 0;
        }

        return false;
    }

    /**
     * Verifica compatibilidade semântica (mesmo Major em >= 1.0, ou mesmo Major e Minor em 0.x).
     */
    public isCompatibleWith(other: SemanticVersion): boolean {
        if (this._major === 0 && other.major === 0) {
            return this._minor === other.minor;
        }
        return this._major === other.major;
    }

    public toString(): string {
        return this._raw;
    }

    public toJSON(): string {
        return this._raw;
    }
}
