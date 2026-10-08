/*
 * Copyright (c) 2024 Rob Royce
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ChatMessage } from '@app/models/chat.model';
import { fadeIn, fadeInAndOut, flyInOut } from '@app/animations';
import { ChatService } from '@services/chat-services/chat.service';
import { take } from 'rxjs/operators';

interface QuizQuestion {
  question: string;
  choices: string[];
  answer: string;
  correct: boolean;
  answered: boolean;
}

@Component({
  selector: 'chat-quiz',
  template: `
    <div *ngIf="complete" @fadeIn class="w-full h-full flex-col-center-center">
      <div class="w-full h-full h-15rem flex-col-center-center">
        <div class="text-5xl">Nice Work!</div>
        <div>
          <div (dragstart)="$event.preventDefault()">
            <img
              src="https://knowledge-app.s3.us-west-1.amazonaws.com/kc-icon-transparent.png"
              alt="Knowledge Logo"
              class="knowledge-logo pulsate-fwd"
            />
          </div>
        </div>
        <div class="text-500">
          {{ quip }}
        </div>
      </div>
    </div>
    <div *ngIf="tryAgain" @fadeIn class="w-full h-full flex-col-center-center">
      <div class="w-full h-full h-15rem flex-col-center-center gap-4">
        <div class="text-5xl">Try Again?</div>
        <div class="">
          <button
            pButton
            type="button"
            label="Let's Go!"
            (click)="tryAgain = false; nextQuestion()"
          ></button>
        </div>
        <div class="text-500">
          You got {{ numberCorrect }} out of {{ questions.length }} correct
        </div>
      </div>
    </div>
    <div
      *ngIf="questions.length === 0"
      class="w-full h-full flex-col-center-center"
    >
      <div>
        <div class="text-5xl">Uh oh!</div>
        <div class="text-500">
          There was a problem with this quiz. You might need to delete this
          message and try again.
        </div>
      </div>
    </div>
    <div
      *ngIf="!complete && !tryAgain"
      class="w-full h-full flex-col-center-center"
    >
      <div *ngFor="let question of questions; let i = index" class="w-full">
        <div
          *ngIf="i === questionIndex && question.answered"
          class="flex-col-center-center h-full pulsate-fwd top-50 sticky"
        >
          <div
            @fadeIn
            *ngIf="question.correct; else incorrect"
            class="flex-col-center-center w-full h-full font-bold m-2 p-2 text-3xl text-color"
          >
            Correct!
          </div>
          <ng-template #incorrect>
            <div
              @fadeIn
              class="flex-col-center-center w-full h-full text-color"
            >
              <div class="font-bold m-2 p-2 text-3xl">Try Again!</div>
              <div>The correct answer was {{ question.answer }}</div>
            </div>
          </ng-template>
        </div>
        <div
          @fadeIn
          *ngIf="i === questionIndex && !question.answered"
          class="flex-col-center-center"
        >
          <div
            class="font-bold m-2 p-2 text-2xl text-color text-center no-select"
          >
            {{ questions[questionIndex].question }}
          </div>
          <div class="grid flex-row-center-center w-full px-6 py-4">
            <div
              *ngFor="let choice of questions[questionIndex].choices"
              class="col-6"
            >
              <div
                class="question-choice surface-card hover:surface-hover hover:shadow-3 p-card px-3"
                (click)="answer(question, choice)"
              >
                {{ choice }}
              </div>
            </div>
          </div>
          <div class="text-center">
            {{ questionIndex + 1 }} /
            {{ questions.length }}
          </div>
          <div class="h-4rem flex-col-center-center text-center text-700 px-6">
            <div
              *ngIf="!hint"
              class="text-primary underline cursor-pointer select-none"
              (click)="help(question)"
            >
              Need Help?
            </div>
            <div *ngIf="hint">
              {{ hint }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        max-width: 100rem !important;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
      }
      .question-choice {
        cursor: pointer !important;
        display: flex;
        flex-direction: column;
        align-content: center;
        justify-content: center;
        align-items: center;
        text-align: center !important;
        min-width: 50% !important;
        height: 5rem;
      }
    `,
  ],
  animations: [fadeInAndOut, flyInOut, fadeIn],
})
export class QuizMessage implements OnChanges {
  @Input() message!: ChatMessage;

  /* The questions, choices, and answers */
  questions: QuizQuestion[] = [];

  /* The index of the current question */
  questionIndex = 0;

  complete = false;

  tryAgain = false;

  private quips = [
    'Look at you go, you little genius',
    "It's big brain time",
    "You're on fire",
    "You're a wizard, Harry",
    'Take it easy, Einstein',
    'How do you know all this stuff?',
    'Next stop, Jeopardy',
    'Can I borrow your brain for a sec?',
    'Your mom would be proud',
    "I'd give you a high five if I could",
  ];

  quip: string;

  hint?: string = undefined;

  private audio = {
    correct: new Audio(),
    incorrect: new Audio(),
    complete: new Audio(),
  };

  constructor(private chat: ChatService) {
    // Select a random quip to display after the user gets all questions correct
    function getRandomInt(max: number) {
      return Math.floor(Math.random() * Math.floor(max));
    }
    this.quip = this.quips[getRandomInt(this.quips.length)];
    this.audio.correct.src = 'assets/sounds/correct.wav';
    this.audio.incorrect.src = 'assets/sounds/incorrect.wav';
    this.audio.complete.src = 'assets/sounds/complete.wav';
    this.audio.correct.load();
    this.audio.incorrect.load();
    this.audio.complete.load();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.message) {
      setTimeout(() => {
        this.questions = this.parseQuiz(changes.message.currentValue);
      }, 100);
    }
  }

  get numberCorrect() {
    return this.questions.filter((question) => question.correct).length;
  }

  private parseQuiz(message: ChatMessage): QuizQuestion[] {
    const questions: QuizQuestion[] = [];
    const qaRegex = /Q.*\n+A.*\n+B.*\n+C.*\n+D.*\n+A.*\n*$/gm;
    const matches = message.text.match(qaRegex);

    if (!matches) {
      console.warn('No matches found in quiz message: ', message.text);
      return [];
    }

    for (const match of matches) {
      const components = match.split('\n');

      // Remove any blank elements
      for (let i = 0; i < components.length; i++) {
        if (components[i] === '') {
          components.splice(i, 1);
        }
      }

      const question: QuizQuestion = {
        question: components[0].replace(/Q[0-9]*\. /, ''),
        choices: [components[1], components[2], components[3], components[4]],
        answer: components[5].replace('Answer: ', '').substring(0, 1),
        correct: false,
        answered: false,
      };
      questions.push(question);
    }

    return questions;
  }

  answer(question: QuizQuestion, choice: string) {
    question.answered = true;

    // Answer index is the index of the choice in the choices array
    const answerIndex = question.choices.indexOf(choice);

    // The answer will be either A, B, C, or D
    const answer = String.fromCharCode(65 + answerIndex);

    // Check if the answer is correct
    question.correct = answer === question.answer;

    // If the answer is correct, play a sound
    if (question.correct) {
      this.audio.correct.play();
    } else {
      this.audio.incorrect.play();
    }

    setTimeout(() => {
      this.nextQuestion();
    }, 1650);
  }

  nextQuestion() {
    this.hint = undefined;

    if (this.questions.every((question) => question.answered)) {
      // If all questions were answered correctly, celebrate with a small animation
      if (this.questions.every((question) => question.correct)) {
        this.complete = true;
        this.audio.complete.play();
        return;
      } else {
        this.tryAgain = true;
        this.audio.incorrect.play();
      }
    }

    // Otherwise, go to the next question that has not been answered correctly
    // Make sure to wrap around to the beginning if necessary
    let index = (this.questionIndex + 1) % this.questions.length;
    while (index < this.questions.length && this.questions[index].correct) {
      index = (index + 1) % this.questions.length;
    }

    if (this.questions[index].answered) {
      this.questions[index].answered = false;
    }
    this.questionIndex = index;
  }

  help(question: QuizQuestion) {
    this.chat.messages$.pipe(take(1)).subscribe((messages) => {
      const augmented = [
        ...this.chat.convertToOpenAI(messages),
        {
          role: 'system',
          content:
            'The following is a question from a quiz you gave to the user.',
        },
        {
          role: 'system',
          content: 'Keep in mind it is a multiple choice question.',
        },
        {
          role: 'system',
          content: `Question: ${question.question}`,
        },
        {
          role: 'system',
          content: `The following answer is provided strictly for you to paraphrase and help the user figure it out on their own.`,
        },
        {
          role: 'system',
          content: `${question.answer}`,
        },
        {
          role: 'system',
          content:
            'Do not, under any circumstance, give the user the answer to this question.',
        },
        {
          role: 'system',
          content: 'Please starting your response with "hint: "',
        },
        {
          role: 'user',
          content:
            'I need help trying to figure out this question, but I do not want you to tell me the answer.',
        },
      ];
      this.chat
        .post('/chat', { messages: augmented })
        .pipe(take(1))
        .subscribe((response) => {
          this.hint = response;
        });
    });
  }
}
