export interface Cell {
	isMine: boolean;
	isRevealed: boolean;
	isFlagged: boolean;
	adjacentMines: number;
}

export type Board = Cell[][];

export class Game {
	private board: Board;
	private isFirstClick = true;
	private rows: number;
	private cols: number;
	private mines: number;

	constructor(rows: number, cols: number, mines: number) {
		this.board = this.generateBoard(rows, cols, mines);
		this.rows = rows;
		this.cols = cols;
		this.mines = mines;
	}
	public getBoard(): Board {
		return this.board;
	}
	public flagCell(row: number, col: number): void {
		const cell = this.board[row][col];
		if (!cell.isRevealed) {
			cell.isFlagged = !cell.isFlagged;
		}
	}

	public checkWin(): boolean {
		return this.board.every((row) => row.every((cell) => cell.isRevealed !== cell.isMine));
	}

	public checkLose(): boolean {
		return this.board.some((row) => row.some((cell) => cell.isRevealed && cell.isMine));
	}

	public revealCell(row: number, col: number): Board {
		const cell = this.board[row][col];
		if (this.isFirstClick) {
			// Guarantee that the first cell clicked is not a mine
			this.isFirstClick = false;
			while (this.board[row][col].isMine || this.board[row][col].adjacentMines != 0) {
				this.board = this.generateBoard(this.rows, this.cols, this.mines);
			}
		}
		if (cell.isRevealed) {
			let minesFlagged = 0;
			for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
				for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, this.board[0].length - 1); j++) {
					if (this.board[i][j].isRevealed) continue;
					minesFlagged += +this.board[i][j].isFlagged;
				}
			}
			if (minesFlagged == cell.adjacentMines) {
				for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
					for (
						let j = Math.max(col - 1, 0);
						j <= Math.min(col + 1, this.board[0].length - 1);
						j++
					) {
						if (this.board[i][j].isRevealed || this.board[i][j].isFlagged) continue;
						this.board = this.revealCell(i, j);
					}
				}
			}
			return this.board;
		}
		if (cell.isFlagged) return this.board;
		cell.isRevealed = true;
		if (cell.adjacentMines === 0 && !cell.isMine) {
			for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
				for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, this.board[0].length - 1); j++) {
					if (!this.board[i][j].isRevealed) {
						this.board = this.revealCell(i, j);
					}
				}
			}
		}
		return this.board;
	}

	private generateBoard(rows: number, cols: number, mines: number): Board {
		const board: Board = Array(rows)
			.fill(null)
			.map(() =>
				Array(cols)
					.fill(null)
					.map(
						(): Cell => ({
							isMine: false,
							isRevealed: false,
							isFlagged: false,
							adjacentMines: 0
						})
					)
			);
		let minesPlaced = 0;
		while (minesPlaced < mines) {
			const row = Math.floor(Math.random() * rows);
			const col = Math.floor(Math.random() * cols);
			if (!board[row][col].isMine) {
				board[row][col].isMine = true;
				minesPlaced++;
			}
		}
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (board[row][col].isMine) continue;
				let count = 0;
				for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, rows - 1); i++) {
					for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, cols - 1); j++) {
						if (board[i][j].isMine) count++;
					}
				}
				board[row][col].adjacentMines = count;
			}
		}
		return board;
	}
}
